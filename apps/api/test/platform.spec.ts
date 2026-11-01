import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it } from 'node:test';
import { parseWxrBundle } from '../src/feeds/wxr';
import { createSigningKey, hashPackageFiles, signPackageHash, verifyPackageHash, compareVersions } from '../src/extensions/package-signature';
import { hostAllowed, isPublicHostname, startPluginSandbox } from '../src/extensions/sandbox/plugin-sandbox';

describe('package signatures', () => {
  it('verifies an ed25519 hash and rejects a different key', () => {
    const key = createSigningKey('test');
    const hash = hashPackageFiles([
      { path: 'plugin.json', data: Buffer.from('{"id":"demo"}') },
      { path: 'index.js', data: Buffer.from('module.exports = {}') },
    ]);
    const signature = signPackageHash(key.privatePem, hash);
    assert.equal(verifyPackageHash(key.publicPem, hash, signature), true);
    const other = createSigningKey('other');
    assert.equal(verifyPackageHash(other.publicPem, hash, signature), false);
    assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  });
});

describe('network allow list', () => {
  it('refuses private hosts and honors the manifest list', () => {
    assert.equal(isPublicHostname('127.0.0.1'), false);
    assert.equal(isPublicHostname('10.0.0.8'), false);
    assert.equal(isPublicHostname('api.example.com'), true);
    assert.equal(hostAllowed('api.example.com', ['api.example.com']), true);
    assert.equal(hostAllowed('evil.example.com', ['api.example.com']), false);
    assert.equal(hostAllowed('127.0.0.1', ['127.0.0.1']), false);
  });
});

describe('wxr statuses', () => {
  it('keeps private and scheduled posts instead of turning them into drafts', () => {
    const xml = `<?xml version="1.0"?>
<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<item>
<title>Secret</title>
<wp:post_type>post</wp:post_type>
<wp:status>private</wp:status>
<wp:post_id>9</wp:post_id>
<wp:post_name>secret</wp:post_name>
<dc:creator>Ada</dc:creator>
<content:encoded><![CDATA[Hidden]]></content:encoded>
</item>
<item>
<title>Later</title>
<wp:post_type>post</wp:post_type>
<wp:status>future</wp:status>
<wp:post_date>2026-12-01 09:00:00</wp:post_date>
<wp:post_name>later</wp:post_name>
<content:encoded><![CDATA[Soon]]></content:encoded>
</item>
<item>
<title>Photo</title>
<wp:post_type>attachment</wp:post_type>
<wp:post_id>4</wp:post_id>
<wp:attachment_url>https://cdn.example.com/photo.jpg</wp:attachment_url>
</item>
</channel>
</rss>`;
    const bundle = parseWxrBundle(xml);
    assert.equal(bundle.items[0].visibility, 'PRIVATE');
    assert.equal(bundle.items[0].status, 'PUBLISHED');
    assert.equal(bundle.items[0].author, 'Ada');
    assert.equal(bundle.items[1].status, 'SCHEDULED');
    assert.equal(bundle.items[1].date, '2026-12-01 09:00:00');
    assert.equal(bundle.attachments[0].url, 'https://cdn.example.com/photo.jpg');
  });
});

describe('plugin sandbox', () => {
  it('blocks filesystem and network builtins, and runs a filter over RPC', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'op-plugin-'));
    writeFileSync(
      join(dir, 'plugin.json'),
      JSON.stringify({
        id: 'boxed',
        name: 'Boxed',
        version: '1.0.0',
        main: 'index.js',
        permissions: ['content:read'],
      }),
    );
    writeFileSync(
      join(dir, 'index.js'),
      `function activate(ctx) {
        ctx.hooks.addFilter('the_title', (title) => title + '!');
        let fsBlocked = false;
        let httpBlocked = false;
        let fetchBlocked = false;
        try { require('fs').readFileSync('/etc/passwd'); } catch (error) { fsBlocked = /blocked|ACCESS_DENIED|denied/i.test(String(error)); }
        try { require('http').get('http://example.com'); } catch (error) { httpBlocked = /blocked/i.test(String(error)); }
        try { fetch('https://example.com'); } catch (error) { fetchBlocked = /blocked/i.test(String(error)); }
        ctx.hooks.addFilter('sandbox_report', () => ({ fsBlocked, httpBlocked, fetchBlocked }));
      }
      module.exports = { activate };`,
    );
    const calls: string[] = [];
    const handle = await startPluginSandbox({
      dir,
      manifest: {
        id: 'boxed',
        name: 'Boxed',
        version: '1.0.0',
        main: 'index.js',
        permissions: ['content:read'],
      },
      onCall: async (method) => {
        calls.push(method);
        if (method === 'content.list') return [];
        throw new Error(`unexpected ${method}`);
      },
    });
    try {
      assert.equal(await handle.invoke(handle.registrations[0].id, ['Hi']), 'Hi!');
      const report = (await handle.invoke(handle.registrations[1].id, [])) as {
        fsBlocked: boolean;
        httpBlocked: boolean;
        fetchBlocked: boolean;
      };
      assert.equal(report.fsBlocked, true);
      assert.equal(report.httpBlocked, true);
      assert.equal(report.fetchBlocked, true);
      assert.deepEqual(calls, []);
    } finally {
      handle.dispose();
    }
  });
});
