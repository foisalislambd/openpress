import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCapabilities, withNetworkAdmin } from '../src/auth/capability-resolve';
import { ROLE_CAPABILITIES } from '../src/auth/capabilities';
import { serializeBlocks, validateBlocks } from '../src/blocks/block-document';
import { buildContentQuery, ContentQueryError } from '../src/content/content-query';
import { failureDelaySeconds, isDue, nextRun } from '../src/cron/cron-schedule';
import { menuParentError, nestMenuItems, safeMenuUrl } from '../src/menus/menu-tree';
import { validateOptionValue, type OptionDefinition } from '../src/settings/option-defs';
import { findConflicts, matchRewrite, structureRule } from '../src/rewrite/rewrite-rules';
import { coreWidgetView } from '../src/widgets/widget-render';

describe('capability resolution', () => {
  it('lets a deny beat a role grant, except on the administrator role', () => {
    const editor = resolveCapabilities({
      role: 'EDITOR',
      roleCapabilities: ROLE_CAPABILITIES.EDITOR,
      grants: ['manage_options'],
      denies: ['publish_posts', 'manage_options'],
    });
    assert.equal(editor.includes('publish_posts'), false);
    assert.equal(editor.includes('manage_options'), false);
    assert.equal(editor.includes('edit_posts'), true);

    const admin = resolveCapabilities({
      role: 'ADMIN',
      roleCapabilities: ['read'],
      protectedCapabilities: ROLE_CAPABILITIES.ADMIN,
      grants: [],
      denies: ['manage_options', 'delete_users'],
    });
    assert.equal(admin.includes('manage_options'), true);
    assert.equal(admin.includes('delete_users'), true);
    const network = withNetworkAdmin(admin, true);
    assert.equal(network.includes('manage_network'), true);
    assert.equal(withNetworkAdmin(editor, false).includes('manage_sites'), false);
  });
});

describe('content query', () => {
  it('forces public posts to published visibility and parameterizes search', () => {
    const built = buildContentQuery({
      type: 'POST',
      constrainBuiltinPosts: true,
      status: 'DRAFT',
      visibility: 'PRIVATE',
      search: 'hello%',
      publicOnly: true,
      orderBy: 'relevance',
    });
    assert.match(built.where, /c\.status = 'PUBLISHED'/);
    assert.match(built.where, /c\.visibility IN \('PUBLIC', 'PASSWORD'\)/);
    assert.doesNotMatch(built.where, /DRAFT/);
    assert.match(built.where, /c\."postType" = 'post'/);
    assert.equal(built.params.includes('%hello\\%%'), true);
    assert.match(built.order, /ts_rank/);
  });

  it('filters a month and a visibility list without interpolating them', () => {
    const built = buildContentQuery({
      type: 'POST',
      month: '202611',
      visibility: ['PUBLIC', 'PASSWORD'],
      perPage: 20,
    });
    assert.match(built.where, /to_char\(date_trunc\('month'/);
    assert.match(built.where, /c\.visibility = ANY\(\$\d+::text\[\]\)/);
    assert.deepEqual(built.params, ['POST', ['PUBLIC', 'PASSWORD'], '202611']);
    assert.equal(built.perPage, 20);
    assert.throws(() => buildContentQuery({ month: '2026-11' }), ContentQueryError);
  });

  it('rejects a meta key that is not an identifier', () => {
    assert.throws(() => buildContentQuery({ meta: [{ key: 'a;drop', compare: 'exists' }] }), ContentQueryError);
  });
});

describe('block documents', () => {
  it('escapes text and drops javascript links', () => {
    const validated = validateBlocks([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '<script>alert(1)</script>', styles: { bold: true } },
          { type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: 'x' }] },
        ],
      },
      { type: 'image', props: { url: 'https://cdn.example/a.png', caption: 'A "pic"' } },
    ]);
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const html = serializeBlocks(validated.blocks);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /javascript:/);
    assert.match(html, /src="https:\/\/cdn\.example\/a\.png"/);
  });

  it('rejects unknown block types', () => {
    const validated = validateBlocks([{ type: 'php', content: [] }]);
    assert.equal(validated.ok, false);
  });
});

describe('cron schedule', () => {
  it('does not run a locked event and backs off failures', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(isDue({ nextRunAt: now, lockedUntil: new Date(now.getTime() + 1000) }, now), false);
    assert.equal(isDue({ nextRunAt: now, lockedUntil: now }, now), true);
    assert.equal(nextRun(now, 30).toISOString(), '2026-01-01T00:00:30.000Z');
    assert.equal(failureDelaySeconds(3, null) > failureDelaySeconds(1, null), true);
  });
});

describe('rewrite rules', () => {
  it('detects a custom rule that collides with the dated permalink', () => {
    const core = structureRule('/%year%/%monthnum%/%postname%/');
    assert.ok(core);
    const custom = {
      id: 'custom',
      pattern: '^/(\\d{4})/(\\d{2})/([^/]+)/?$',
      query: { rewriteTo: '/$3' },
      source: 'custom',
      priority: 10,
    };
    const conflicts = findConflicts([custom], core ? [core] : []);
    assert.equal(conflicts.some((item) => item.path === '/2026/01/hello-world'), true);
    const match = matchRewrite('/2026/01/hello', [custom]);
    assert.equal(match?.rewriteTo, '/hello');
    assert.equal(matchRewrite('/admin', [{ ...custom, pattern: '^/admin$', id: 'bad' }]), null);
  });
});

describe('menus and widgets', () => {
  it('nests items and rejects a cycle', () => {
    const tree = nestMenuItems([
      { id: 'a', parentId: null, position: 0, title: 'Home', url: '/', type: 'custom', objectId: null, target: '' },
      { id: 'b', parentId: 'a', position: 0, title: 'About', url: '/about', type: 'page', objectId: null, target: '' },
    ]);
    assert.equal(tree[0].children[0].title, 'About');
    assert.equal(menuParentError([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: null }], 'b', 'a'), 'Menu items cannot contain a cycle');
    assert.equal(safeMenuUrl('javascript:alert(1)'), null);
    assert.equal(safeMenuUrl('/about'), '/about');
  });

  it('renders a search widget without trusting html', () => {
    const view = coreWidgetView(
      { id: '1', type: 'search', settings: { title: 'Find' } },
      {},
    );
    assert.equal(view?.form?.action, '/search');
    assert.equal(coreWidgetView({ id: '2', type: 'plugin/x', settings: {} }, {}), null);
  });
});

describe('meta and tax queries', () => {
  it('builds an OR group and a category tree match', () => {
    const built = buildContentQuery({
      siteId: 'site_main',
      meta: {
        relation: 'OR',
        clauses: [
          { key: 'color', value: 'blue' },
          { key: 'price', value: 10, compare: 'gte', type: 'numeric' },
        ],
      },
      tax: {
        relation: 'AND',
        clauses: [{ taxonomy: 'category', terms: ['news'], includeChildren: true }],
      },
    });
    assert.match(built.where, / OR /);
    assert.match(built.where, /WITH RECURSIVE tree/);
    assert.equal(built.params.includes('color'), true);
    assert.equal(built.params.includes('site_main'), true);
  });

  it('rejects a meta key that is not an identifier inside a group', () => {
    assert.throws(
      () => buildContentQuery({ meta: { relation: 'AND', clauses: [{ key: 'a;drop', compare: 'exists' }] } }),
      ContentQueryError,
    );
  });
});

describe('kses and locks', () => {
  it('drops script tags and javascript links', async () => {
    const { kses } = await import('../src/html/kses');
    const { lockIsHeld, lockUntil } = await import('../src/content/content-lock');
    const html = kses('<p>Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://example.com">ok</a>');
    assert.match(html, /<p>Hi<\/p>/);
    assert.doesNotMatch(html, /script/);
    assert.doesNotMatch(html, /javascript:/);
    assert.match(html, /https:\/\/example.com/);
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(lockIsHeld({ userId: 'a', expiresAt: lockUntil(now) }, 'b', now), true);
    assert.equal(lockIsHeld({ userId: 'a', expiresAt: now }, 'b', new Date(now.getTime() + 1)), false);
  });
});

describe('options', () => {
  const posts: OptionDefinition = {
    key: 'postsPerPage',
    group: 'reading',
    type: 'number',
    autoload: true,
    label: 'Posts',
    public: true,
    defaultValue: 10,
    source: 'core',
  };

  it('rejects an out of range posts per page', () => {
    assert.equal(validateOptionValue(posts, 10), null);
    assert.match(validateOptionValue(posts, 99) ?? '', /postsPerPage/);
  });
});
