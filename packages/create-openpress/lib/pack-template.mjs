import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyTree, findCheckoutRoot } from './scaffold.mjs';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(packageRoot, 'template');

if (process.argv.includes('--clean')) {
  rmSync(template, { recursive: true, force: true });
} else {
  const checkout = findCheckoutRoot(packageRoot);
  if (!checkout) {
    console.error('prepack: OpenPress checkout not found. Refusing to pack a tarball without the API and web source.');
    process.exit(1);
  }
  rmSync(template, { recursive: true, force: true });
  const count = copyTree(checkout, template);
  console.error(`prepack: copied ${count} files into the create-openpress template. This does not publish the package.`);
}
