import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import AdmZip from 'adm-zip';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';

export interface ThemeManifestFile {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  engine: 'runtime-v1';
  tokens: Record<string, string>;
}

export const THEMES_STORE_DIR = resolve(process.cwd(), 'themes-store');
const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

@Injectable()
export class InstalledThemesService implements OnModuleInit {
  onModuleInit() {
    if (!existsSync(THEMES_STORE_DIR)) {
      mkdirSync(THEMES_STORE_DIR, { recursive: true });
    }
  }

  list(): ThemeManifestFile[] {
    if (!existsSync(THEMES_STORE_DIR)) return [];
    return readdirSync(THEMES_STORE_DIR, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          existsSync(join(THEMES_STORE_DIR, d.name, 'theme.json')),
      )
      .map((d) => this.manifest(d.name));
  }

  manifest(id: string): ThemeManifestFile {
    if (!ID_RE.test(id)) throw new NotFoundException('Theme not found');
    const file = join(THEMES_STORE_DIR, id, 'theme.json');
    if (!existsSync(file)) throw new NotFoundException('Theme not found');
    return JSON.parse(readFileSync(file, 'utf8'));
  }

  install(file: Express.Multer.File): ThemeManifestFile {
    if (!file?.buffer && !file?.path) {
      throw new BadRequestException('No file uploaded');
    }
    const zip = new AdmZip(file.buffer ?? file.path);
    const entries = zip.getEntries();

    let entry = entries.find((e) => e.entryName === 'theme.json');
    let rootPrefix = '';
    if (!entry) {
      entry = entries.find(
        (e) =>
          e.entryName.endsWith('/theme.json') &&
          e.entryName.split('/').length === 2,
      );
      if (entry) rootPrefix = entry.entryName.slice(0, -'theme.json'.length);
    }
    if (!entry) throw new BadRequestException('Zip does not contain theme.json');

    const manifest: ThemeManifestFile = JSON.parse(
      entry.getData().toString('utf8'),
    );
    if (!manifest?.id || !ID_RE.test(manifest.id)) {
      throw new BadRequestException(
        'theme.json must contain a lowercase alphanumeric "id"',
      );
    }
    if (!manifest.name || !manifest.version) {
      throw new BadRequestException('theme.json must contain "name" and "version"');
    }
    if (manifest.engine !== 'runtime-v1') {
      throw new BadRequestException(
        'Only "runtime-v1" engine themes can be uploaded (set "engine": "runtime-v1")',
      );
    }
    if (!manifest.tokens || typeof manifest.tokens !== 'object') {
      throw new BadRequestException('theme.json must contain a "tokens" object');
    }

    const dest = join(THEMES_STORE_DIR, manifest.id);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const e of entries) {
      if (e.isDirectory) continue;
      if (rootPrefix && !e.entryName.startsWith(rootPrefix)) continue;
      const relative = e.entryName.slice(rootPrefix.length);
      if (!relative || relative.includes('..')) continue;
      const target = join(dest, relative);
      if (!resolve(target).startsWith(resolve(dest))) continue; // zip-slip guard
      mkdirSync(join(target, '..'), { recursive: true });
      zip.extractEntryTo(e, join(target, '..'), false, true);
    }
    return manifest;
  }

  remove(id: string) {
    this.manifest(id); // throws if missing
    rmSync(join(THEMES_STORE_DIR, id), { recursive: true, force: true });
    return { id };
  }

  customCss(id: string): string {
    this.manifest(id);
    const file = join(THEMES_STORE_DIR, id, 'style.css');
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
  }
}
