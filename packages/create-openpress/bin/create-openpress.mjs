#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main } from '../lib/scaffold.mjs';

export {
  main,
  pluginFiles,
  renderCompose,
  scaffoldPlugin,
} from '../lib/scaffold.mjs';

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  const abort = new AbortController();
  process.on('SIGINT', () => abort.abort());
  process.on('SIGTERM', () => abort.abort());
  main(process.argv.slice(2), undefined, { signal: abort.signal }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(error?.code === 'CANCELLED' ? 130 : 1);
  });
}
