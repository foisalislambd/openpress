import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { compileCollectionFilter, parseCollectionSchema } from '../src/extensions/collections';
import { ExtensionRegistry } from '../src/extensions/extension-registry';
import { sanitizeHeadHtml } from '../src/extensions/head-html';
import { handlePluginCall, namespacedHook } from '../src/extensions/plugin-calls';
import { validatePluginManifest } from '../src/extensions/plugin-manifest';
import { startPluginSandbox } from '../src/extensions/sandbox/plugin-sandbox';
import { HooksService } from '../src/hooks/hooks.service';
import { renderThemeTemplate } from '../../../packages/theme-sdk/src/templates.ts';

describe('plugin collections', () => {
  const schema = parseCollectionSchema({
    name: 'entries',
    fields: {
      email: { type: 'string', required: true },
      status: { type: 'string', values: ['new', 'read'], required: true },
    },
  });

  it('rejects field names that are not in the schema', () => {
    assert.throws(() => compileCollectionFilter(schema, { where: { 'email; drop table': 'x' } }), /Unknown filter field/);
  });

  it('keeps filter values in parameters', () => {
    const compiled = compileCollectionFilter(schema, { where: { status: 'new', email: { contains: 'ada%' } }, limit: 10 }, 3);
    assert.match(compiled.sql, /data->>\$3/);
    assert.equal(compiled.sql.includes('drop'), false);
    assert.equal(compiled.params.includes('status'), true);
    assert.equal(compiled.params.some((value) => String(value).includes('ada')), true);
    assert.equal(compiled.limit, 10);
  });

  it('does not accept a sql fragment as a collection name', () => {
    assert.throws(() => parseCollectionSchema({ name: 'entries;drop', fields: { email: { type: 'string' } } }), /Collection name/);
  });
});

describe('extension permissions and hooks', () => {
  it('accepts the platform permissions and still rejects unknown ones', () => {
    validatePluginManifest({
      id: 'books',
      name: 'Books',
      version: '1.0.0',
      main: 'index.js',
      permissions: ['data', 'modeling', 'cron', 'content:read', 'content:write', 'admin_menu'],
      removeData: true,
    });
    assert.throws(
      () =>
        validatePluginManifest({
          id: 'books',
          name: 'Books',
          version: '1.0.0',
          main: 'index.js',
          permissions: ['shell' as 'data'],
        }),
      /Unknown plugin permission/,
    );
  });

  it('namespaces cron hooks to the plugin id', () => {
    assert.equal(namespacedHook('books', 'recount'), 'books.recount');
    assert.equal(namespacedHook('books', 'openpress.publish_due'), 'books.openpress.publish_due');
    assert.notEqual(namespacedHook('books', 'openpress.publish_due'), 'openpress.publish_due');
    assert.throws(() => namespacedHook('books', ''), /Invalid cron hook/);
  });

  it('drops scripts from head tags and keeps a safe meta tag', () => {
    const tags = sanitizeHeadHtml(['<meta name="description" content="Hello">', '<script>alert(1)</script>', '<meta http-equiv="refresh" content="0">']);
    assert.deepEqual(tags, ['<meta name="description" content="Hello">']);
  });

  it('escapes template values and strips active markup', () => {
    const html = renderThemeTemplate('<h1>{{title}}</h1>{{#posts}}<a href="{{url}}">{{title}}</a>{{/posts}}', {
      title: '<script>',
      posts: [{ title: 'Ada', url: 'javascript:alert(1)' }],
    });
    assert.match(html, /&lt;script&gt;/);
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('javascript:'), false);
    assert.match(html, /Ada/);
  });
});

describe('plugin data calls', () => {
  it('inserts only sanitized fields for the plugin that defined the collection', async () => {
    const registry = new ExtensionRegistry();
    registry.addCollection('contact-form', parseCollectionSchema({
      name: 'entries',
      fields: { email: { type: 'string', required: true }, status: { type: 'string', required: true } },
    }));
    const calls: { sql: string; params: unknown[] }[] = [];
    const db = {
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        return [];
      },
      async one() {
        return null;
      },
    };
    const hooks = new HooksService(new EventEmitter2());
    await assert.rejects(
      () =>
        handlePluginCall(
          {
            db,
            hooks,
            registry,
            core: { capabilitiesFor: () => [] } as never,
            cron: { schedule: async () => ({ id: '1', hook: 'contact-form.daily' }) },
            manifest: { id: 'contact-form', name: 'Contact', version: '1.0.0', main: 'index.js' },
          },
          'data.insert',
          ['entries', { email: 'ada@example.com', status: 'new', passwordHash: 'nope' }],
        ),
      /Unknown field/,
    );
    await handlePluginCall(
      {
        db,
        hooks,
        registry,
        core: { capabilitiesFor: () => [] } as never,
        cron: { schedule: async () => ({ id: '1', hook: 'contact-form.daily' }) },
        manifest: { id: 'contact-form', name: 'Contact', version: '1.0.0', main: 'index.js' },
      },
      'data.insert',
      ['entries', { email: 'ada@example.com', status: 'new' }],
    );
    assert.match(calls[0].sql, /plugin_records/);
    assert.equal(calls[0].params[1], 'contact-form');
    assert.equal(String(calls[0].params[3]).includes('passwordHash'), false);
  });
});

describe('sandbox platform boundary', () => {
  it('refuses collection access without the data permission and still blocks the database', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'op-plugin-data-'));
    writeFileSync(
      join(dir, 'plugin.json'),
      JSON.stringify({ id: 'boxed', name: 'Boxed', version: '1.0.0', main: 'index.js' }),
    );
    writeFileSync(
      join(dir, 'index.js'),
      `async function activate(ctx) {
        let dataBlocked = false;
        let dbBlocked = false;
        try { await ctx.data.insert('entries', {}); } catch (error) { dataBlocked = /data/.test(String(error)); }
        try { ctx.db.query('select 1'); } catch (error) { dbBlocked = /SQL|database/i.test(String(error)); }
        ctx.hooks.addFilter('boundary', () => ({ dataBlocked, dbBlocked }));
      }
      module.exports = { activate };`,
    );
    const handle = await startPluginSandbox({
      dir,
      manifest: { id: 'boxed', name: 'Boxed', version: '1.0.0', main: 'index.js', permissions: [] },
      onCall: async () => {
        throw new Error('parent should not be called');
      },
    });
    try {
      const report = (await handle.invoke(handle.registrations[0].id, [])) as { dataBlocked: boolean; dbBlocked: boolean };
      assert.equal(report.dataBlocked, true);
      assert.equal(report.dbBlocked, true);
    } finally {
      handle.dispose();
    }
  });
});
