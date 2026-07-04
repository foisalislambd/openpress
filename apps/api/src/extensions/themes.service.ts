import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import AdmZip from 'adm-zip';
import { buildSync } from 'esbuild';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'fs';
import { join, resolve } from 'path';

export interface ThemeManifestFile {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  // runtime-v1: design-token theme (theme.json + style.css)
  // react-v1:   full-code React theme (own components, bundled on upload)
  engine: 'runtime-v1' | 'react-v1';
  tokens?: Record<string, string>;
  entry?: string;
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

  list(): (ThemeManifestFile & { updatedAt: number })[] {
    if (!existsSync(THEMES_STORE_DIR)) return [];
    return readdirSync(THEMES_STORE_DIR, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          existsSync(join(THEMES_STORE_DIR, d.name, 'theme.json')),
      )
      .map((d) => this.manifest(d.name));
  }

  manifest(id: string): ThemeManifestFile & { updatedAt: number } {
    if (!ID_RE.test(id)) throw new NotFoundException('Theme not found');
    const file = join(THEMES_STORE_DIR, id, 'theme.json');
    if (!existsSync(file)) throw new NotFoundException('Theme not found');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    return { ...manifest, updatedAt: statSync(file).mtimeMs };
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
    this.validate(manifest);

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

    if (manifest.engine === 'react-v1') {
      try {
        this.bundleReactTheme(dest, manifest);
      } catch (err) {
        rmSync(dest, { recursive: true, force: true });
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(
          `Theme build failed: ${message.slice(0, 500)}`,
        );
      }
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

  bundle(id: string): string {
    const manifest = this.manifest(id);
    if (manifest.engine !== 'react-v1') {
      throw new NotFoundException('This theme has no code bundle');
    }
    const file = join(THEMES_STORE_DIR, id, 'bundle.js');
    if (!existsSync(file)) throw new NotFoundException('Bundle missing');
    return readFileSync(file, 'utf8');
  }

  // Compile the theme's JSX/TSX source into one CommonJS bundle.
  // React itself stays external and is provided by the site at render time.
  private bundleReactTheme(dir: string, manifest: ThemeManifestFile) {
    const entryFile = join(dir, manifest.entry ?? 'index.jsx');
    if (!existsSync(entryFile)) {
      throw new Error(`Entry file "${manifest.entry ?? 'index.jsx'}" not found`);
    }
    buildSync({
      entryPoints: [entryFile],
      bundle: true,
      format: 'cjs',
      platform: 'neutral',
      jsx: 'automatic',
      external: ['react', 'react/jsx-runtime', 'react-dom'],
      outfile: join(dir, 'bundle.js'),
      minify: false,
      target: 'es2020',
      logLevel: 'silent',
    });
  }

  private validate(manifest: ThemeManifestFile) {
    if (!manifest?.id || !ID_RE.test(manifest.id)) {
      throw new BadRequestException(
        'theme.json must contain a lowercase alphanumeric "id"',
      );
    }
    if (!manifest.name || !manifest.version) {
      throw new BadRequestException(
        'theme.json must contain "name" and "version"',
      );
    }
    if (manifest.engine === 'runtime-v1') {
      if (!manifest.tokens || typeof manifest.tokens !== 'object') {
        throw new BadRequestException(
          'runtime-v1 themes need a "tokens" object in theme.json',
        );
      }
    } else if (manifest.engine === 'react-v1') {
      if (manifest.entry && manifest.entry.includes('..')) {
        throw new BadRequestException('Invalid "entry" path');
      }
    } else {
      throw new BadRequestException(
        'theme.json "engine" must be "runtime-v1" (token theme) or "react-v1" (code theme)',
      );
    }
  }
}
