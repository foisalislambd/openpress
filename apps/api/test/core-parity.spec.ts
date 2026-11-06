import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pluginActivationOrder } from '../src/extensions/plugin-order';
import { pluralIndex, translate } from '../src/i18n/gettext';
import { commentDepth, threadComments } from '../src/comments/comment-thread';
import { themeFileError } from '../src/themes/theme-files';
import { skippedIntervals } from '../src/cron/cron-schedule';
import { serializeBlocks, validateBlocks } from '../src/blocks/block-document';
import { compileJsonCatalog, compileMo, parsePo, readMoHeader } from '../src/i18n/po';
import { pdfPreviewArgs } from '../src/media/pdf-preview';

describe('plugin activation order', () => {
  it('loads dependencies first and refuses a cycle', () => {
    const plan = pluginActivationOrder([
      { id: 'seo', dependencies: ['blocks'], enabled: true },
      { id: 'blocks', enabled: true },
      { id: 'idle', enabled: false },
    ]);
    assert.deepEqual(plan.order, ['blocks', 'seo']);
    assert.deepEqual(plan.errors, []);
    const cycle = pluginActivationOrder([
      { id: 'a', dependencies: ['b'], enabled: true },
      { id: 'b', dependencies: ['a'], enabled: true },
    ]);
    assert.equal(cycle.order.length, 0);
    assert.match(cycle.errors.join(' '), /cycle/);
  });
});

describe('gettext', () => {
  it('picks the plural form and falls back to the msgid', () => {
    assert.equal(pluralIndex('en', 1), 0);
    assert.equal(pluralIndex('en', 2), 1);
    assert.equal(pluralIndex('ja', 2), 0);
    const text = translate(
      [{ locale: 'en', domain: 'openpress', context: '', msgid: '%d item', msgidPlural: '%d items', msgstr: '1 item', msgstrPlural: '%d items' }],
      { locale: 'en', msgid: '%d item', count: 3 },
    );
    assert.equal(text, '%d items');
    assert.equal(translate([], { locale: 'en', msgid: 'Hello' }), 'Hello');
  });
});

describe('comment threads', () => {
  it('nests replies and stops past five levels', () => {
    const rows = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'missing' },
    ];
    const tree = threadComments(rows);
    assert.equal(tree.length, 2);
    assert.equal(tree[0].replies.length, 1);
    const chain = ['1', '2', '3', '4', '5', '6'].map((id, index) => ({ id, parentId: index === 0 ? null : String(index) }));
    assert.equal(commentDepth(chain, '5') > 5, true);
  });
});

describe('theme files', () => {
  it('allows style.css and theme.json and rejects script-bearing css', () => {
    assert.equal(themeFileError('style.css', 'body { color: red }'), null);
    assert.equal(themeFileError('plugin.php', '<?php'), 'Only style.css and theme.json can be edited');
    assert.match(themeFileError('style.css', 'a { background: javascript:alert(1) }') ?? '', /not allowed/);
    assert.equal(themeFileError('theme.json', '{"colors":{"ink":"#111"}}'), null);
  });
});

describe('cron catch-up', () => {
  it('counts missed intervals without asking the runner to replay them', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const now = new Date(start.getTime() + 5 * 60_000);
    assert.equal(skippedIntervals(start, 60, now), 5);
    assert.equal(skippedIntervals(start, 60, new Date(start.getTime() + 30_000)), 0);
  });
});

describe('gettext compile', () => {
  it('parses a po file into json and a mo header', () => {
    const messages = parsePo('msgid "Hello"\nmsgstr "Bonjour"\n');
    assert.equal(messages[0]?.msgstr[0], 'Bonjour');
    const json = compileJsonCatalog('fr', 'openpress', messages);
    assert.equal(json.translations['']?.Hello?.msgstr[0], 'Bonjour');
    const mo = compileMo(messages);
    assert.equal(readMoHeader(mo)?.magic, 0x950412de);
    assert.equal((readMoHeader(mo)?.count ?? 0) >= 1, true);
  });
});

describe('pdf thumbnails', () => {
  it('asks poppler for the first page only', () => {
    assert.deepEqual(pdfPreviewArgs('/tmp/a.pdf', '/tmp/a-pdf'), ['-png', '-f', '1', '-l', '1', '-singlefile', '-scale-to', '1024', '/tmp/a.pdf', '/tmp/a-pdf']);
  });
});

describe('richer blocks', () => {
  it('serializes layout blocks and rejects an unknown type', () => {
    const validated = validateBlocks([
      { type: 'separator' },
      { type: 'spacer', props: { height: 40 } },
      { type: 'button', props: { url: 'https://example.com', label: 'Go' } },
    ]);
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const html = serializeBlocks(validated.blocks);
    assert.match(html, /<hr/);
    assert.match(html, /height:40px/);
    assert.match(html, /example.com/);
    assert.equal(validateBlocks([{ type: 'php' }]).ok, false);
  });
});
