import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExtensionRegistry, expandShortcodes } from '../src/extensions/extension-registry';
import { createPluginContext } from '../src/extensions/plugin-context';
import { validatePluginManifest, versionSatisfies } from '../src/extensions/plugin-manifest';
import { HooksService } from '../src/hooks/hooks.service';

describe('plugin manifest', () => {
  it('accepts a compatible manifest and rejects unknown permissions', () => {
    assert.equal(versionSatisfies('>=0.1.0', '0.1.0'), true);
    assert.equal(versionSatisfies('^0.1.0', '0.9.0'), true);
    assert.equal(versionSatisfies('^0.1.0', '1.0.0'), false);
    assert.equal(versionSatisfies('0.1.0', '0.1.1'), false);
    validatePluginManifest({
      id: 'hello-logger',
      name: 'Hello',
      version: '1.0.0',
      main: 'index.js',
      requires: { openpress: '>=0.1.0' },
      permissions: ['settings', 'admin_menu'],
    });
    assert.throws(
      () =>
        validatePluginManifest({
          id: 'hello-logger',
          name: 'Hello',
          version: '1.0.0',
          main: 'index.js',
          permissions: ['shell' as 'settings'],
        }),
      /Unknown plugin permission/,
    );
    assert.throws(
      () =>
        validatePluginManifest({
          id: 'hello-logger',
          name: 'Hello',
          version: '1.0.0',
          main: 'index.js',
          requires: { openpress: '>=9.0.0' },
        }),
      /requires OpenPress/,
    );
  });
});

describe('plugin context permissions', () => {
  it('registers declared extension points and refuses the database otherwise', async () => {
    const hooks = new HooksService(new EventEmitter2());
    const registry = new ExtensionRegistry();
    const { ctx, dispose } = createPluginContext({
      manifest: {
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        main: 'index.js',
        permissions: ['admin_menu', 'shortcodes', 'widgets', 'blocks', 'rest', 'assets'],
      },
      hooks,
      registry,
      db: { query: async () => [], one: async () => null },
      pluginDir: '/tmp/demo',
    });

    assert.throws(() => ctx.db.query('select 1'), /database/);
    ctx.admin.addMenuPage({
      slug: 'demo-settings',
      title: 'Demo',
      fields: [{ key: 'greeting', label: 'Greeting', type: 'text' }],
    });
    ctx.shortcodes.add('greet', (attrs) => `Hello ${attrs.name ?? 'there'}`);
    ctx.widgets.register({ id: 'note', name: 'Note', render: (instance) => instance.text ?? '' });
    ctx.blocks.register({ name: 'demo/note', title: 'Note' });
    ctx.rest.route('GET', '/ping', () => ({ ok: true }));
    ctx.assets.enqueueStyle('demo', 'assets/demo.css');
    ctx.hooks.addFilter('the_title', (value) => `${value}!`);

    assert.equal(registry.adminPages()[0].slug, 'demo-settings');
    assert.equal(await hooks.applyFilters('the_title', 'Hi'), 'Hi!');
    const [block] = await registry.expandBlocks([
      { type: 'paragraph', content: [{ type: 'text', text: '[greet name="Ada"]' }] },
    ]);
    assert.equal(
      (block as { content: { text: string }[] }).content[0].text,
      'Hello Ada',
    );
    assert.equal(expandShortcodes('[year]', () => '2026'), '2026');
    dispose();
    assert.equal(registry.adminPages().length, 0);
    assert.equal(await hooks.applyFilters('the_title', 'Hi'), 'Hi');
  });
});
