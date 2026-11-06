import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import AdmZip from 'adm-zip';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { DbService } from '../db/db.service';
import { HooksService } from '../hooks/hooks.service';
import { ExtensionRegistry } from './extension-registry';
import { hashPackageFiles, SIGNATURE_FILE, verifyPackageHash, compareVersions, PackageSignature } from './package-signature';
import { hostAllowed, PluginRegistration, SandboxHandle, startPluginSandbox } from './sandbox/plugin-sandbox';
import { PluginManifest, PluginPermission, validatePluginManifest } from './plugin-manifest';
import { CoreRegistry, optionType } from '../core/core-registry';
import { TransientsService } from '../sites/transients.service';

export type { PluginManifest };

interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  dispose: () => void;
}

interface StagedPlugin {
  dir: string;
  manifest: PluginManifest;
  hash: string;
  signatureStatus: 'trusted' | 'unsigned' | 'invalid';
  createdAt: number;
}

const PLUGINS_DIR = resolve(process.cwd(), 'plugins');
const ENABLED_KEY = 'enabledPlugins';
const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger('Plugins');
  private loaded = new Map<string, LoadedPlugin>();
  private errors = new Map<string, string>();
  private staged = new Map<string, StagedPlugin>();

  constructor(
    private db: DbService,
    private hooks: HooksService,
    private registry: ExtensionRegistry,
    private core: CoreRegistry,
    private transients: TransientsService,
  ) {}

  async onModuleInit() {
    if (!existsSync(PLUGINS_DIR)) mkdirSync(PLUGINS_DIR, { recursive: true });
    const enabled = await this.enabledIds();
    for (const id of this.installedIds()) {
      if (enabled.includes(id)) {
        try {
          await this.load(id);
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
        allowedHosts: manifest.allowedHosts ?? [],
        sandbox: true,
        canRollback:
          existsSync(join(PLUGINS_DIR, '.history', id)) &&
          readdirSync(join(PLUGINS_DIR, '.history', id)).length > 0,
        error: this.errors.get(id) ?? null,
      };
    });
  }

  async stage(file: Express.Multer.File) {
    if (!file?.buffer && !file?.path) throw new BadRequestException('No file uploaded');
    const zip = new AdmZip(file.buffer ?? file.path);
    const { manifest, rootPrefix } = this.findManifestInZip(zip, 'plugin.json');
    this.validateManifest(manifest);
    const token = randomUUID();
    const dest = join(tmpdir(), 'openpress-stage', token);
    this.extract(zip, rootPrefix, dest);
    if (!existsSync(join(dest, manifest.main))) {
      rmSync(dest, { recursive: true, force: true });
      throw new BadRequestException(`Plugin main file "${manifest.main}" not found in zip`);
    }
    const files = this.packageFiles(dest);
    const hash = hashPackageFiles(files);
    const signatureStatus = await this.signatureStatus(dest, hash);
    if (signatureStatus === 'invalid') {
      rmSync(dest, { recursive: true, force: true });
      throw new BadRequestException('Package signature does not match a trusted key');
    }
    this.staged.set(token, { dir: dest, manifest, hash, signatureStatus, createdAt: Date.now() });
    return {
      token,
      manifest,
      hash,
      signatureStatus,
      permissions: manifest.permissions ?? [],
      allowedHosts: manifest.allowedHosts ?? [],
      requires: manifest.requires ?? {},
    };
  }

  async commit(token: string) {
    const staged = this.staged.get(token);
    if (!staged || Date.now() - staged.createdAt > 15 * 60 * 1000) {
      throw new NotFoundException('That install review expired. Upload the package again.');
    }
    const { manifest } = staged;
    const dest = join(PLUGINS_DIR, manifest.id);
    if (existsSync(dest)) {
      const previous = this.readManifest(dest);
      const history = join(PLUGINS_DIR, '.history', manifest.id, `${previous.version}-${Date.now()}`);
      mkdirSync(join(history, '..'), { recursive: true });
      cpSync(dest, history, { recursive: true });
    }
    rmSync(dest, { recursive: true, force: true });
    cpSync(staged.dir, dest, { recursive: true });
    rmSync(staged.dir, { recursive: true, force: true });
    this.staged.delete(token);
    await this.rememberRelease(manifest, staged.hash, staged.signatureStatus);
    await this.setEnabled(manifest.id, true);
    await this.load(manifest.id);
    this.logger.log(`Installed plugin "${manifest.id}" v${manifest.version} (${staged.signatureStatus})`);
    return { ...manifest, enabled: true, loaded: true, signatureStatus: staged.signatureStatus };
  }

  async rollback(id: string) {
    this.assertInstalled(id);
    const historyRoot = join(PLUGINS_DIR, '.history', id);
    if (!existsSync(historyRoot)) throw new NotFoundException('No previous release to roll back to');
    const versions = readdirSync(historyRoot).sort();
    const previous = versions[versions.length - 1];
    if (!previous) throw new NotFoundException('No previous release to roll back to');
    const dest = join(PLUGINS_DIR, id);
    this.unload(id);
    rmSync(dest, { recursive: true, force: true });
    cpSync(join(historyRoot, previous), dest, { recursive: true });
    rmSync(join(historyRoot, previous), { recursive: true, force: true });
    await this.load(id);
    return { id, restored: previous };
  }

  async updates() {
    const catalog = await this.catalog();
    const installed = await this.list();
    return installed.map((plugin) => {
      const remote = catalog.find((item) => item.id === plugin.id);
      const available = remote && compareVersions(plugin.version, remote.version) < 0 ? remote : null;
      return { id: plugin.id, version: plugin.version, available };
    });
  }

  async toggle(id: string) {
    this.assertInstalled(id);
    const enabled = await this.enabledIds();
    const nowEnabled = !enabled.includes(id);
    await this.setEnabled(id, nowEnabled);
    if (nowEnabled) await this.load(id);
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

  private async load(id: string) {
    if (this.loaded.has(id)) this.unload(id);
    const dir = join(PLUGINS_DIR, id);
    const manifest = this.readManifest(dir);
    this.validateManifest(manifest);
    this.registry.clear(id);
    const disposers: Array<() => void> = [];
    let handle: SandboxHandle;
    try {
      handle = await startPluginSandbox({
        dir,
        manifest,
        logger: this.logger,
        onCall: (method, args) => this.bridge(manifest, method, args),
      });
    } catch (error) {
      this.registry.clear(id);
      throw error;
    }
    for (const registration of handle.registrations) {
      const remove = this.bindRegistration(manifest, handle, registration);
      if (remove) disposers.push(remove);
    }
    this.loaded.set(id, {
      manifest,
      dir,
      dispose: () => {
        for (const dispose of disposers) dispose();
        handle.dispose();
        this.registry.clear(id);
        this.core.clear(id);
      },
    });
    this.errors.delete(id);
    this.logger.log(`Plugin "${id}" activated in a sandbox`);
  }

  private unload(id: string) {
    const plugin = this.loaded.get(id);
    if (!plugin) {
      this.registry.clear(id);
      this.core.clear(id);
      return;
    }
    plugin.dispose();
    this.loaded.delete(id);
    this.logger.log(`Plugin "${id}" deactivated`);
  }

  private bindRegistration(manifest: PluginManifest, handle: SandboxHandle, registration: PluginRegistration) {
    const pluginId = manifest.id;
    if (registration.kind === 'action' && registration.event) {
      return this.hooks.addAction(registration.event, (...args) => handle.invoke(registration.id, args), registration.priority ?? 10);
    }
    if (registration.kind === 'filter' && registration.event) {
      return this.hooks.addFilter(
        registration.event,
        (value, ...args) => handle.invoke(registration.id, [value, ...args]),
        registration.priority ?? 10,
      );
    }
    if (registration.kind === 'page' && registration.slug && registration.title) {
      this.registry.addPage({
        pluginId,
        slug: registration.slug,
        title: registration.title,
        menuTitle: registration.menuTitle || registration.title,
        fields: (registration.fields ?? []).map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type === 'textarea' ? 'textarea' : 'text',
        })),
      });
    }
    if (registration.kind === 'widget' && registration.widgetId && registration.name) {
      this.registry.addWidget({
        pluginId,
        id: registration.widgetId,
        name: registration.name,
        render: (instance) => handle.invoke(registration.id, [instance]) as Promise<string>,
      });
    }
    if (registration.kind === 'shortcode' && registration.tag) {
      this.registry.addShortcode({
        pluginId,
        tag: registration.tag,
        render: (attrs) => handle.invoke(registration.id, [attrs]) as Promise<string>,
      });
    }
    if (registration.kind === 'block' && registration.name && registration.title) {
      this.registry.addBlock({ pluginId, name: registration.name, title: registration.title, description: registration.description });
    }
    if (registration.kind === 'rest' && registration.method && registration.path) {
      this.registry.addRoute({
        pluginId,
        method: registration.method,
        path: registration.path,
        handler: (req) => handle.invoke(registration.id, [req]),
      });
    }
    if (registration.kind === 'capability' && registration.name) {
      this.core.addCapability({ name: registration.name, label: registration.title || registration.name, source: pluginId });
    }
    if (registration.kind === 'setting' && registration.optionKey) {
      const key = registration.optionKey.startsWith(`${pluginId}.`)
        ? registration.optionKey
        : `${pluginId}.${registration.optionKey}`;
      this.core.addOption({
        key,
        group: registration.optionGroup || 'plugin',
        type: optionType(registration.optionType || 'string'),
        autoload: registration.optionAutoload !== false,
        label: registration.title || key,
        public: false,
        defaultValue: registration.optionType === 'boolean' ? false : registration.optionType === 'number' ? 0 : '',
        source: pluginId,
      });
    }
    if (registration.kind === 'rewrite' && registration.pattern && registration.query) {
      this.core.addRewrite({
        id: `${pluginId}:${registration.pattern}`,
        pattern: registration.pattern,
        query: registration.query,
        source: pluginId,
        priority: registration.priority ?? 20,
      });
    }
    if (registration.kind === 'asset' && registration.handle && registration.file && registration.assetKind) {
      this.registry.addAsset({
        pluginId,
        handle: registration.handle,
        file: registration.file,
        kind: registration.assetKind,
        href: `/api/plugins/files/${pluginId}/${registration.file.replace(/^\/+/, '')}`,
      });
    }
    return null;
  }

  private async bridge(manifest: PluginManifest, method: string, args: unknown[]) {
    const permissions = new Set(manifest.permissions ?? []);
    const allow = (permission: PluginPermission) => {
      if (!permissions.has(permission)) {
        throw new Error(`Plugin "${manifest.id}" has not declared the "${permission}" permission`);
      }
    };
    if (method === 'hooks.doAction') {
      await this.hooks.doAction(String(args[0] ?? ''), ...((args[1] as unknown[]) ?? []));
      return null;
    }
    if (method === 'hooks.applyFilters') {
      return this.hooks.applyFilters(String(args[0] ?? ''), args[1], ...((args[2] as unknown[]) ?? []));
    }
    if (method === 'content.list' || method === 'content.get') allow('content:read');
    if (method === 'content.create' || method === 'content.update') allow('content:write');
    if (method.startsWith('storage.')) allow('storage');
    if (method.startsWith('settings.')) allow('settings');
    if (method === 'http.fetch') allow('network:request');
    if (method === 'email.send') allow('email:send');

    if (method === 'content.list') {
      const query = (args[0] ?? {}) as { search?: string };
      const search = typeof query.search === 'string' ? query.search.slice(0, 80) : '';
      return this.db.query(
        `SELECT id, type, status, visibility, title, slug, excerpt
         FROM contents
         WHERE ($1 = '' OR title ILIKE '%' || $1 || '%')
         ORDER BY "updatedAt" DESC
         LIMIT 20`,
        [search],
      );
    }
    if (method === 'content.get') {
      return this.db.one(
        `SELECT id, type, status, visibility, title, slug, excerpt FROM contents WHERE id = $1`,
        [String(args[0] ?? '')],
      );
    }
    if (method === 'content.create') {
      const input = (args[0] ?? {}) as { title?: string; type?: string; excerpt?: string };
      const title = String(input.title || '').trim().slice(0, 200);
      if (!title) throw new Error('title is required');
      const author = await this.db.one<{ id: string }>(
        `SELECT id FROM users WHERE role = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1`,
      );
      if (!author) throw new Error('No admin user is available to own plugin content');
      const id = randomUUID();
      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post'}-${id.slice(0, 8)}`;
      await this.db.query(
        `INSERT INTO contents (id, type, status, title, slug, excerpt, blocks, "authorId", "updatedAt")
         VALUES ($1, $2::"ContentType", 'DRAFT', $3, $4, $5, '[]'::jsonb, $6, now())`,
        [id, input.type === 'PAGE' ? 'PAGE' : 'POST', title, slug, input.excerpt ? String(input.excerpt).slice(0, 500) : null, author.id],
      );
      return { id, slug, status: 'DRAFT' };
    }
    if (method === 'content.update') {
      const input = (args[1] ?? {}) as { title?: string; excerpt?: string; status?: string };
      const status = input.status === 'PUBLISHED' || input.status === 'DRAFT' ? input.status : null;
      await this.db.query(
        `UPDATE contents
         SET title = COALESCE($2, title),
             excerpt = COALESCE($3, excerpt),
             status = COALESCE($4::"ContentStatus", status),
             "updatedAt" = now()
         WHERE id = $1`,
        [String(args[0] ?? ''), input.title ? String(input.title).slice(0, 200) : null, input.excerpt ? String(input.excerpt).slice(0, 500) : null, status],
      );
      return { id: args[0], updated: true };
    }
    if (method === 'storage.get') {
      const row = await this.db.one<{ value: unknown }>(
        'SELECT value FROM plugin_storage WHERE "pluginId" = $1 AND key = $2',
        [manifest.id, String(args[0] ?? '').slice(0, 80)],
      );
      return row?.value ?? null;
    }
    if (method === 'storage.set') {
      const key = String(args[0] ?? '').slice(0, 80);
      if (!/^[a-zA-Z0-9_:-]{1,80}$/.test(key)) throw new Error('Invalid storage key');
      await this.db.query(
        `INSERT INTO plugin_storage ("pluginId", key, value, "updatedAt")
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT ("pluginId", key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
        [manifest.id, key, JSON.stringify(args[1] ?? null)],
      );
      return true;
    }
    if (method === 'storage.delete') {
      await this.db.query('DELETE FROM plugin_storage WHERE "pluginId" = $1 AND key = $2', [
        manifest.id,
        String(args[0] ?? ''),
      ]);
      return true;
    }
    if (method === 'transient.get') return this.transients.get(String(args[0] ?? ''));
    if (method === 'transient.set') {
      const ttl = args[2] === undefined ? undefined : Number(args[2]);
      return this.transients.set(String(args[0] ?? ''), args[1], ttl);
    }
    if (method === 'transient.delete') return this.transients.delete(String(args[0] ?? ''));
    if (method === 'settings.get') return this.getSettings(manifest.id);
    if (method === 'settings.set') {
      const values = (args[0] ?? {}) as Record<string, unknown>;
      const current = (await this.getSettings(manifest.id)) as Record<string, unknown>;
      const next = { ...current };
      for (const [key, value] of Object.entries(values)) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key) || typeof value !== 'string' || value.length > 5000) continue;
        next[key] = value;
      }
      await this.db.query(
        `INSERT INTO settings (key, value, "updatedAt") VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
        [`plugin:${manifest.id}`, JSON.stringify(next)],
      );
      return next;
    }
    if (method === 'http.fetch') {
      const url = new URL(String(args[0] ?? ''));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only HTTP(S) URLs are allowed');
      if (!hostAllowed(url.hostname, manifest.allowedHosts ?? [])) {
        throw new Error(`Host "${url.hostname}" is not in this plugin's allow list`);
      }
      const init = (args[1] ?? {}) as { method?: string; body?: string };
      const response = await fetch(url, {
        method: init.method === 'POST' ? 'POST' : 'GET',
        body: init.method === 'POST' ? String(init.body ?? '').slice(0, 100_000) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      const text = (await response.text()).slice(0, 1_000_000);
      return { status: response.status, body: text };
    }
    if (method === 'email.send') {
      const message = (args[0] ?? {}) as { to?: string; subject?: string; body?: string };
      const to = String(message.to ?? '');
      if (!/^[^\s@]+@[^\s@]+$/.test(to)) throw new Error('A valid recipient is required');
      await this.db.query(
        `INSERT INTO outbound_mail (id, "pluginId", "toAddress", subject, body) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), manifest.id, to.slice(0, 200), String(message.subject ?? '').slice(0, 200), String(message.body ?? '').slice(0, 20_000)],
      );
      return { queued: true };
    }
    throw new Error(`Unknown plugin call "${method}"`);
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

  private packageFiles(dir: string, prefix = ''): { path: string; data: Buffer }[] {
    const files: { path: string; data: Buffer }[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...this.packageFiles(full, relative));
      else files.push({ path: relative, data: readFileSync(full) });
    }
    return files;
  }

  private async signatureStatus(dir: string, hash: string): Promise<StagedPlugin['signatureStatus']> {
    const file = join(dir, SIGNATURE_FILE);
    if (!existsSync(file)) return 'unsigned';
    let signature: PackageSignature;
    try {
      signature = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return 'invalid';
    }
    const keys = await this.db.query<{ publicKey: string }>('SELECT "publicKey" FROM trusted_keys');
    return keys.some((key) => verifyPackageHash(key.publicKey, hash, signature)) ? 'trusted' : 'invalid';
  }

  private async rememberRelease(manifest: PluginManifest, hash: string, signatureStatus: string) {
    await this.db.query(
      `INSERT INTO plugin_releases (id, "pluginId", version, "sha256", "signatureStatus", permissions)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [randomUUID(), manifest.id, manifest.version, hash, signatureStatus, JSON.stringify(manifest.permissions ?? [])],
    );
  }

  private async catalog(): Promise<{ id: string; version: string }[]> {
    const row = await this.db.one<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', ['packageCatalog']);
    if (!Array.isArray(row?.value)) return [];
    return row.value.filter((item) => item && typeof item === 'object' && 'id' in item && 'version' in item) as {
      id: string;
      version: string;
    }[];
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
