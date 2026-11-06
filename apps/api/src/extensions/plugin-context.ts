import { Logger } from '@nestjs/common';
import { Db } from '../db/db.service';
import { HooksService } from '../hooks/hooks.service';
import { ExtensionRegistry } from './extension-registry';
import { PluginManifest, PluginPermission } from './plugin-manifest';
import { CoreRegistry, optionType } from '../core/core-registry';
import { TransientsService } from '../sites/transients.service';

export function createPluginContext(options: {
  manifest: PluginManifest;
  hooks: HooksService;
  registry: ExtensionRegistry;
  db: Db;
  pluginDir: string;
  core?: CoreRegistry;
  transients?: TransientsService;
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
    transients: {
      get: (key: string) => {
        allow('settings');
        if (!options.transients) throw new Error('Transients are not available');
        return options.transients.get(String(key));
      },
      set: (key: string, value: unknown, ttlSeconds?: number) => {
        allow('settings');
        if (!options.transients) throw new Error('Transients are not available');
        return options.transients.set(String(key), value, ttlSeconds);
      },
      delete: (key: string) => {
        allow('settings');
        if (!options.transients) throw new Error('Transients are not available');
        return options.transients.delete(String(key));
      },
    },
    settings: {
      /** This plugin's own options. Does not read or write site settings. */
      get: () => readPluginSettings(),
      set: (values: Record<string, unknown>) => writePluginSettings(values),
      register: (def: { key: string; type?: string; label?: string; group?: string; autoload?: boolean }) => {
        allow('settings');
        const key = def.key.startsWith(`${pluginId}.`) ? def.key : `${pluginId}.${def.key}`;
        options.core?.addOption({
          key,
          group: def.group || 'plugin',
          type: optionType(def.type || 'string'),
          autoload: def.autoload !== false,
          label: def.label || key,
          public: false,
          defaultValue: '',
          source: pluginId,
        });
      },
    },
    capabilities: {
      register: (cap: { name: string; label?: string }) => {
        allow('settings');
        options.core?.addCapability({ name: cap.name, label: cap.label || cap.name, source: pluginId });
      },
    },
    rewrite: {
      add: (rule: { pattern: string; query?: Record<string, string>; priority?: number }) => {
        allow('rest');
        options.core?.addRewrite({
          id: `${pluginId}:${rule.pattern}`,
          pattern: rule.pattern,
          query: rule.query ?? {},
          source: pluginId,
          priority: rule.priority ?? 20,
        });
      },
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
      options.core?.clear(pluginId);
    },
  };
}
