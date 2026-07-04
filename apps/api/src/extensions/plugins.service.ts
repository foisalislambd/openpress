import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
}

interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  listeners: { event: string; handler: (...args: unknown[]) => void }[];
}

const PLUGINS_DIR = resolve(process.cwd(), 'plugins');
const ENABLED_KEY = 'enabledPlugins';
const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger('Plugins');
  private loaded = new Map<string, LoadedPlugin>();

  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async onModuleInit() {
    if (!existsSync(PLUGINS_DIR)) mkdirSync(PLUGINS_DIR, { recursive: true });
    const enabled = await this.enabledIds();
    for (const id of this.installedIds()) {
      if (enabled.includes(id)) {
        try {
          this.load(id);
        } catch (e) {
          this.logger.error(`Failed to load plugin "${id}": ${e}`);
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

    const listeners: LoadedPlugin['listeners'] = [];
    const context = {
      hooks: {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          this.events.on(event, handler);
          listeners.push({ event, handler });
        },
      },
      logger: new Logger(`plugin:${id}`),
      db: this.prisma,
      manifest,
    };
    activate(context);
    this.loaded.set(id, { manifest, dir, listeners });
    this.logger.log(`Plugin "${id}" activated`);
  }

  private unload(id: string) {
    const plugin = this.loaded.get(id);
    if (!plugin) return;
    for (const { event, handler } of plugin.listeners) {
      this.events.off(event, handler);
    }
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
    if (!manifest?.id || !ID_RE.test(manifest.id)) {
      throw new BadRequestException(
        'plugin.json must contain a lowercase alphanumeric "id"',
      );
    }
    if (!manifest.name || !manifest.version || !manifest.main) {
      throw new BadRequestException(
        'plugin.json must contain "name", "version" and "main"',
      );
    }
    if (manifest.main.includes('..')) {
      throw new BadRequestException('Invalid "main" path');
    }
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
    const row = await this.prisma.setting.findUnique({
      where: { key: ENABLED_KEY },
    });
    return Array.isArray(row?.value) ? (row.value as string[]) : [];
  }

  private async setEnabled(id: string, enabled: boolean) {
    const current = await this.enabledIds();
    const next = enabled
      ? Array.from(new Set([...current, id]))
      : current.filter((x) => x !== id);
    await this.prisma.setting.upsert({
      where: { key: ENABLED_KEY },
      create: { key: ENABLED_KEY, value: next as Prisma.InputJsonValue },
      update: { value: next as Prisma.InputJsonValue },
    });
  }
}
