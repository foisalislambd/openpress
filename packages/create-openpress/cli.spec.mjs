import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main, pluginFiles, renderCompose } from './bin/create-openpress.mjs';

test('pins GHCR images to the requested version', () => {
  const compose = renderCompose('1.2.3-beta.1');
  assert.match(compose, /ghcr.io\/foisalislambd\/openpress-api:1\.2\.3-beta\.1/);
  assert.match(compose, /ghcr.io\/foisalislambd\/openpress-web:1\.2\.3-beta\.1/);
  assert.doesNotMatch(compose, /:latest/);
});

test('scaffolds a plugin and refuses to overwrite it', () => {
  const files = pluginFiles('hello-note');
  assert.match(files['plugin.json'], /"id": "hello-note"/);
  assert.match(files['index.js'], /module\.exports = \{ activate \}/);
  assert.throws(() => pluginFiles('Bad ID'), /lowercase/);
  const dir = mkdtempSync(join(tmpdir(), 'op-plugin-'));
  main(['plugin', 'hello-note', dir]);
  assert.match(readFileSync(join(dir, 'plugin.json'), 'utf8'), /hello-note/);
  assert.throws(() => main(['plugin', 'hello-note', dir]), /already exists/);
});

test('scaffolds a site directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-site-'));
  main([dir]);
  assert.match(readFileSync(join(dir, 'docker-compose.yml'), 'utf8'), /openpress-api:/);
});
