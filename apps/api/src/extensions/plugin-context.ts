import { Logger } from '@nestjs/common';
import { Db } from '../db/db.service';
import { HooksService } from '../hooks/hooks.service';
import { ExtensionRegistry } from './extension-registry';
import { PluginManifest, PluginPermission } from './plugin-manifest';

export function createPluginContext(options: {
  manifest: PluginManifest;
  hooks: HooksService;
  registry: ExtensionRegistry;
  db: Db;
  pluginDir: string;
}) {
  const permissions = new Set<PluginPermission>(options.manifest.permissions ?? []);
  const allow = (permission: PluginPermission) => {
    if (!permissions.has(permission)) {
      throw new Error(`Plugin "${options.manifest.id}" has not declared the "${permission}" permission`);
    }
  };
  const disposers: (() => void)[] = [];
  const pluginId = options.manifest.id;
  const settingsKey = `plugin:${pluginId}`;

  async function readPluginSettings() {
    allow('settings');
    const row = await options.db.one<{ value: unknown }>(
      'SELECT value FROM settings WHERE key = $1',
      [settingsKey],
    );
    return row?.value && typeof row.value === 'object' ? row.value : {};
  }

  async function writePluginSettings(values: Record<string, unknown>) {
    allow('settings');
    const current = await readPluginSettings();
    const next: Record<string, unknown> =
      current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : {};
    for (const [key, value] of Object.entries(values)) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) continue;
      if (typeof value !== 'string' || value.length > 5000) continue;
      next[key] = value;
    }
    await options.db.query(
      `INSERT INTO settings (key, value, "updatedAt")
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [settingsKey, JSON.stringify(next)],
    );
    return next;
  }

  const ctx = {
    manifest: options.manifest,
    logger: new Logger(`plugin:${pluginId}`),
    hooks: {
      addAction: (event: string, handler: (...args: unknown[]) => void, priority = 10) => {
        disposers.push(options.hooks.addAction(event, handler, priority));
      },
      doAction: (event: string, ...args: unknown[]) => options.hooks.doAction(event, ...args),
      addFilter: (
        hook: string,
        handler: (value: unknown, ...args: unknown[]) => unknown,
        priority = 10,
      ) => {
        disposers.push(options.hooks.addFilter(hook, handler, priority));
      },
      applyFilters: (hook: string, value: unknown, ...args: unknown[]) =>
        options.hooks.applyFilters(hook, value, ...args),
      /** @deprecated Use addAction. Kept so existing plugins keep working. */
      on: (event: string, handler: (...args: unknown[]) => void) => {
        disposers.push(options.hooks.addAction(event, handler, 10));
      },
    },
    get db() {
      allow('database');
      return {
        query: options.db.query.bind(options.db),
        one: options.db.one.bind(options.db),
      };
    },
    settings: {
      /** This plugin's own options. Does not read or write site settings. */
      get: () => readPluginSettings(),
      set: (values: Record<string, unknown>) => writePluginSettings(values),
    },
    admin: {
      addMenuPage: (page: {
        slug: string;
        title: string;
        menuTitle?: string;
        fields?: { key: string; label: string; type?: 'text' | 'textarea' }[];
      }) => {
        allow('admin_menu');
        options.registry.addPage({
          pluginId,
          slug: page.slug,
          title: page.title,
          menuTitle: page.menuTitle || page.title,
          fields: (page.fields ?? []).map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type === 'textarea' ? 'textarea' : 'text',
          })),
        });
      },
    },
    widgets: {
      register: (widget: {
        id: string;
        name: string;
        render: (instance: { title?: string; text?: string }) => string | Promise<string>;
      }) => {
        allow('widgets');
        options.registry.addWidget({ pluginId, ...widget });
      },
    },
    shortcodes: {
      add: (tag: string, render: (attrs: Record<string, string>) => string | Promise<string>) => {
        allow('shortcodes');
        options.registry.addShortcode({ pluginId, tag, render });
      },
    },
    blocks: {
      register: (block: { name: string; title: string; description?: string }) => {
        allow('blocks');
        options.registry.addBlock({ pluginId, ...block });
      },
    },
    rest: {
      route: (
        method: string,
        path: string,
        handler: (req: { query: Record<string, string>; body: unknown }) => unknown,
      ) => {
        allow('rest');
        const normalized = path.startsWith('/') ? path : `/${path}`;
        options.registry.addRoute({ pluginId, method, path: normalized, handler });
      },
    },
    assets: {
      enqueueStyle: (handle: string, file: string) => {
        allow('assets');
        options.registry.addAsset({
          pluginId,
          handle,
          file,
          kind: 'style',
          href: `/api/plugins/files/${pluginId}/${file.replace(/^\/+/, '')}`,
        });
      },
      enqueueScript: (handle: string, file: string) => {
        allow('assets');
        options.registry.addAsset({
          pluginId,
          handle,
          file,
          kind: 'script',
          href: `/api/plugins/files/${pluginId}/${file.replace(/^\/+/, '')}`,
        });
      },
    },
  };

  return {
    ctx,
    dispose: () => {
      for (const dispose of disposers) dispose();
      options.registry.clear(pluginId);
    },
  };
}
