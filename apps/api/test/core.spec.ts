import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { can, capabilitiesFor } from '../src/auth/capabilities';
import { initialCommentStatus, linkCount } from '../src/comments/comment-policy';
import { isDueForPublish, redactPasswordContent, signUnlock, verifyUnlock } from '../src/content/visibility';
import { buildWxr, parseWxr } from '../src/feeds/wxr';
import { HooksService } from '../src/hooks/hooks.service';
import { clampCrop, plannedSizes } from '../src/media/image-sizes';

describe('capabilities', () => {
  it('lets contributors write drafts but not publish', () => {
    assert.equal(can('CONTRIBUTOR', 'edit_posts'), true);
    assert.equal(can('CONTRIBUTOR', 'publish_posts'), false);
    assert.equal(can('CONTRIBUTOR', 'upload_files'), false);
    assert.equal(can('SUBSCRIBER', 'edit_posts'), false);
    assert.equal(can('AUTHOR', 'publish_posts'), true);
    assert.equal(can('AUTHOR', 'edit_others_posts'), false);
    assert.equal(can('EDITOR', 'edit_pages'), true);
    assert.equal(capabilitiesFor('ADMIN').includes('manage_options'), true);
    assert.equal(can('nope', 'read'), false);
  });
});

describe('visibility', () => {
  it('hides password post blocks until unlock', () => {
    const content = { visibility: 'PASSWORD', blocks: [{ type: 'paragraph' }], title: 'Secret' };
    const locked = redactPasswordContent(content, false);
    assert.equal(locked.passwordRequired, true);
    assert.deepEqual(locked.blocks, []);
    assert.equal(locked.title, 'Secret');
    const open = redactPasswordContent(content, true);
    assert.equal(open.passwordRequired, false);
    assert.equal(open.blocks.length, 1);
  });

  it('signs and checks unlock tokens', () => {
    const now = 1_700_000_000_000;
    const token = signUnlock('secret', 'hello', now, 1000);
    assert.equal(verifyUnlock('secret', token, 'hello', now + 500), true);
    assert.equal(verifyUnlock('secret', token, 'hello', now + 1001), false);
    assert.equal(verifyUnlock('secret', token, 'other', now + 500), false);
    assert.equal(verifyUnlock('other', token, 'hello', now + 500), false);
  });

  it('publishes scheduled posts only when due', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    assert.equal(isDueForPublish('SCHEDULED', '2026-01-01T00:00:00Z', now), true);
    assert.equal(isDueForPublish('SCHEDULED', '2026-01-03T00:00:00Z', now), false);
    assert.equal(isDueForPublish('DRAFT', '2026-01-01T00:00:00Z', now), false);
  });
});

describe('comment policy', () => {
  it('holds guests and flags link spam', () => {
    assert.equal(linkCount('see https://a.test and https://b.test'), 2);
    assert.equal(
      initialCommentStatus({ body: 'https://a.test https://b.test', authenticated: false, moderation: true }),
      'SPAM',
    );
    assert.equal(
      initialCommentStatus({ body: 'Nice post', authenticated: false, moderation: true }),
      'PENDING',
    );
    assert.equal(
      initialCommentStatus({ body: 'Nice post', authenticated: false, moderation: false }),
      'APPROVED',
    );
    assert.equal(
      initialCommentStatus({ body: 'Nice post', authenticated: true, moderation: true }),
      'APPROVED',
    );
  });
});

describe('image sizes', () => {
  it('skips sizes larger than the original', () => {
    assert.deepEqual(plannedSizes(400, { thumbnail: 150, medium: 300, large: 1024 }), [
      { name: 'thumbnail', width: 150 },
      { name: 'medium', width: 300 },
    ]);
    assert.equal(clampCrop({ width: 100, height: 80 }, { x: 10, y: 10, width: 20, height: 20 })?.width, 20);
    assert.equal(clampCrop({ width: 100, height: 80 }, { x: 90, y: 0, width: 20, height: 10 }), null);
  });
});

describe('wxr', () => {
  it('round-trips a post with blocks, terms, and a password', () => {
    const xml = buildWxr({
      siteTitle: 'Demo & Co',
      siteUrl: 'https://example.com',
      items: [
        {
          title: 'Hello <world>',
          slug: 'hello-world',
          type: 'POST',
          status: 'PUBLISHED',
          visibility: 'PASSWORD',
          excerpt: 'Hi',
          blocks: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
          categories: [{ slug: 'news', name: 'News' }],
          tags: [{ slug: 'launch', name: 'Launch' }],
          password: 's3cret',
          sticky: true,
        },
      ],
    });
    const [item] = parseWxr(xml);
    assert.equal(item.title, 'Hello <world>');
    assert.equal(item.slug, 'hello-world');
    assert.equal(item.visibility, 'PASSWORD');
    assert.equal(item.password, 's3cret');
    assert.equal(item.sticky, true);
    assert.equal(item.categories[0].slug, 'news');
    assert.equal(item.tags[0].name, 'Launch');
    assert.equal((item.blocks[0] as { type: string }).type, 'paragraph');
  });
});

describe('hooks', () => {
  it('runs filters by priority and can remove them', async () => {
    const hooks = new HooksService(new EventEmitter2());
    const remove = hooks.addFilter('the_title', (value) => `${value}!`, 20);
    hooks.addFilter('the_title', (value) => String(value).toUpperCase(), 5);
    const titled = await hooks.applyFilters('the_title', 'hello');
    assert.equal(titled, 'HELLO!');
    remove();
    assert.equal(await hooks.applyFilters('the_title', 'hello'), 'HELLO');
  });
});
