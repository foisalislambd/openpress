import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { DbService } from '../db/db.service';
import { HooksService } from '../hooks/hooks.service';
import { ExtensionRegistry } from './extension-registry';
import { createPluginContext } from './plugin-context';
import { PluginManifest, validatePluginManifest } from './plugin-manifest';

export type { PluginManifest };

interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  dispose: () => void;
}

const PLUGINS_DIR = resolve(process.cwd(), 'plugins');
const ENABLED_KEY = 'enabledPlugins';
const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger('Plugins');
  private loaded = new Map<string, LoadedPlugin>();
  private errors = new Map<string, string>();

  constructor(
    private db: DbService,
    private hooks: HooksService,
    private registry: ExtensionRegistry,
  ) {}

  async onModuleInit() {
    if (!existsSync(PLUGINS_DIR)) mkdirSync(PLUGINS_DIR, { recursive: true });
    const enabled = await this.enabledIds();
    for (const id of this.installedIds()) {
      if (enabled.includes(id)) {
        try {
          this.load(id);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          this.errors.set(id, message);
          this.logger.error(`Failed to load plugin "${id}": ${message}`);
        }
      }
    }
  }

  async list() {
    const enabled = await this.enabledIds();
    return this.installedIds().map((id) => {
      const manifest = this.readManifest(join(PLUGINS_DIR, id));
      return {
        ...manifest,
        id,
        enabled: enabled.includes(id),
        loaded: this.loaded.has(id),
        permissions: manifest.permissions ?? [],
        requires: manifest.requires ?? {},
        error: this.errors.get(id) ?? null,
      };
    });
  }

  async install(file: Express.Multer.File) {
    if (!file?.buffer && !file?.path) {
      throw new BadRequestException('No file uploaded');
    }
    const zip = new AdmZip(file.buffer ?? file.path);
    const { manifest, rootPrefix } = this.findManifestInZip(zip, 'plugin.json');
    this.validateManifest(manifest);
    const dest = join(PLUGINS_DIR, manifest.id);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    this.extract(zip, rootPrefix, dest);
    if (!existsSync(join(dest, manifest.main))) {
      rmSync(dest, { recursive: true, force: true });
      throw new BadRequestException(
        `Plugin main file "${manifest.main}" not found in zip`,
      );
    }
    await this.setEnabled(manifest.id, true);
    this.load(manifest.id);
    this.logger.log(`Installed plugin "${manifest.id}" v${manifest.version}`);
    return { ...manifest, enabled: true, loaded: true };
  }

  async toggle(id: string) {
    this.assertInstalled(id);
    const enabled = await this.enabledIds();
    const nowEnabled = !enabled.includes(id);
    await this.setEnabled(id, nowEnabled);
    if (nowEnabled) this.load(id);
    else this.unload(id);
    return { id, enabled: nowEnabled };
  }

  async remove(id: string) {
    this.assertInstalled(id);
    this.unload(id);
    await this.setEnabled(id, false);
    rmSync(join(PLUGINS_DIR, id), { recursive: true, force: true });
    return { id };
  }

  // ---- internals ----

  private load(id: string) {
    if (this.loaded.has(id)) this.unload(id);
    const dir = join(PLUGINS_DIR, id);
    const manifest = this.readManifest(dir);
    this.validateManifest(manifest);
    const mainPath = join(dir, manifest.main);

    delete require.cache[require.resolve(mainPath)];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(mainPath);
    const activate: unknown = mod.activate ?? mod.default?.activate;
    if (typeof activate !== 'function') {
      throw new BadRequestException(
        `Plugin "${id}" does not export an activate() function`,
      );
    }

    this.registry.clear(id);
    const { ctx, dispose } = createPluginContext({
      manifest,
      hooks: this.hooks,
      registry: this.registry,
      db: this.db,
      pluginDir: dir,
    });
    try {
      activate(ctx);
    } catch (error) {
      dispose();
      throw error;
    }
    this.loaded.set(id, { manifest, dir, dispose });
    this.errors.delete(id);
    this.logger.log(`Plugin "${id}" activated`);
  }

  private unload(id: string) {
    const plugin = this.loaded.get(id);
    if (!plugin) {
      this.registry.clear(id);
      return;
    }
    plugin.dispose();
    this.loaded.delete(id);
    this.logger.log(`Plugin "${id}" deactivated`);
  }

  private installedIds(): string[] {
    if (!existsSync(PLUGINS_DIR)) return [];
    return readdirSync(PLUGINS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(PLUGINS_DIR, d.name, 'plugin.json')))
      .map((d) => d.name);
  }

  private assertInstalled(id: string) {
    if (!ID_RE.test(id) || !this.installedIds().includes(id)) {
      throw new NotFoundException(`Plugin "${id}" is not installed`);
    }
  }

  private readManifest(dir: string): PluginManifest {
    return JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf8'));
  }

  private validateManifest(manifest: PluginManifest) {
    try {
      validatePluginManifest(manifest);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid plugin.json');
    }
  }

  async widgetAreas() {
    const row = await this.db.one<{ value: unknown }>(
      'SELECT value FROM settings WHERE key = $1',
      ['widgets'],
    );
    const value = (row?.value ?? {}) as { sidebar?: unknown; footer?: unknown };
    const list = (items: unknown) =>
      Array.isArray(items)
        ? items.filter((item) => item && typeof item === 'object')
        : [];
    return {
      sidebar: list(value.sidebar) as { type?: string; title?: string; text?: string }[],
      footer: list(value.footer) as { type?: string; title?: string; text?: string }[],
    };
  }

  async getSettings(id: string) {
    this.assertInstalled(id);
    const row = await this.db.one<{ value: unknown }>(
      'SELECT value FROM settings WHERE key = $1',
      [`plugin:${id}`],
    );
    return row?.value && typeof row.value === 'object' ? row.value : {};
  }

  async updateSettings(id: string, values: Record<string, unknown>, slug: string) {
    this.assertInstalled(id);
    const page = this.registry.page(id, slug);
    if (!page) throw new NotFoundException('Plugin page not found');
    const allowed = new Set(page.fields.map((field) => field.key));
    const current = (await this.getSettings(id)) as Record<string, unknown>;
    const next = { ...current };
    for (const [key, value] of Object.entries(values)) {
      if (!allowed.has(key)) continue;
      if (typeof value !== 'string' || value.length > 5000) {
        throw new BadRequestException(`Invalid value for ${key}`);
      }
      next[key] = value;
    }
    await this.db.query(
      `INSERT INTO settings (key, value, "updatedAt")
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [`plugin:${id}`, JSON.stringify(next)],
    );
    return next;
  }

  private findManifestInZip(zip: AdmZip, filename: string) {
    const entries = zip.getEntries();
    let entry = entries.find((e) => e.entryName === filename);
    let rootPrefix = '';
    if (!entry) {
      // Zip may contain a single top-level folder
      entry = entries.find(
        (e) => e.entryName.endsWith(`/${filename}`) && e.entryName.split('/').length === 2,
      );
      if (entry) rootPrefix = entry.entryName.slice(0, -filename.length);
    }
    if (!entry) {
      throw new BadRequestException(`Zip does not contain ${filename}`);
    }
    return {
      manifest: JSON.parse(entry.getData().toString('utf8')),
      rootPrefix,
    };
  }

  private extract(zip: AdmZip, rootPrefix: string, dest: string) {
    mkdirSync(dest, { recursive: true });
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (rootPrefix && !entry.entryName.startsWith(rootPrefix)) continue;
      const relative = entry.entryName.slice(rootPrefix.length);
      if (!relative || relative.includes('..')) continue;
      const target = join(dest, relative);
      if (!resolve(target).startsWith(resolve(dest))) continue; // zip-slip guard
      mkdirSync(join(target, '..'), { recursive: true });
      zip.extractEntryTo(entry, join(target, '..'), false, true);
    }
  }

  private async enabledIds(): Promise<string[]> {
    const row = await this.db.one<{ value: unknown }>(
      'SELECT value FROM settings WHERE key = $1',
      [ENABLED_KEY],
    );
    return Array.isArray(row?.value) ? (row.value as string[]) : [];
  }

  private async setEnabled(id: string, enabled: boolean) {
    const current = await this.enabledIds();
    const next = enabled
      ? Array.from(new Set([...current, id]))
      : current.filter((x) => x !== id);
    await this.db.query(
      `INSERT INTO settings (key, value, "updatedAt")
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, "updatedAt" = now()`,
      [ENABLED_KEY, JSON.stringify(next)],
    );
  }
}
