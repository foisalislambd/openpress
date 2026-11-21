import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

export default function prepareExtensions() {
  const plugins = join(root, 'apps/api/plugins');
  const themes = join(root, 'apps/api/themes-store');
  mkdirSync(plugins, { recursive: true });
  mkdirSync(themes, { recursive: true });
  for (const id of ['seo', 'contact-form', 'books']) {
    const dest = join(plugins, id);
    rmSync(dest, { recursive: true, force: true });
    cpSync(join(root, 'examples/plugins', id), dest, { recursive: true });
  }
  for (const id of ['harbor', 'harbor-child']) {
    const dest = join(themes, id);
    rmSync(dest, { recursive: true, force: true });
    cpSync(join(root, 'examples/themes', id), dest, { recursive: true });
  }
}
