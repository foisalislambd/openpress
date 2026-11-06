import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPermalink,
  buildSeoDocument,
  buildSrcSet,
  diffLines,
  isPlainPermalink,
  matchPermalink,
  permalinkDecision,
  sanitizeCss,
  scopeAllows,
  templateCandidates,
} from '../src/cms/publishing';
import { clientDataChallenge } from '../src/auth/security.service';
import { decryptTotpSecret, encryptTotpSecret, totpCode, verifyTotp } from '../src/auth/totp';
import { htmlToBlocks, parseEmDash } from '../src/feeds/emdash';
import { parseWxr } from '../src/feeds/wxr';

describe('permalinks', () => {
  it('builds dated and category paths and matches them back to a slug', () => {
    const input = { slug: 'hello', publishedAt: '2026-11-06T12:00:00Z', category: 'news', author: 'ada' };
    assert.equal(isPlainPermalink('/%postname%/'), true);
    assert.equal(buildPermalink('/%postname%/', input), '/hello/');
    assert.equal(buildPermalink('/%year%/%monthnum%/%postname%/', input), '/2026/11/hello/');
    assert.equal(matchPermalink('/%year%/%monthnum%/%postname%/', '/2026/11/hello/')?.slug, 'hello');
    assert.equal(matchPermalink('/%category%/%postname%/', '/news/hello')?.slug, 'hello');
    assert.equal(matchPermalink('/%year%/%monthnum%/%postname%/', '/category/news'), null);
    assert.equal(buildPermalink('/%author%/%postname%/', input), '/ada/hello/');
    const row = { slug: 'hello', status: 'PUBLISHED', publishedAt: input.publishedAt, category: 'news', author: 'ada' };
    assert.equal(permalinkDecision('/%year%/%monthnum%/%postname%/', '/2026/11/hello/', row).action, 'rewrite');
    assert.equal(permalinkDecision('/%year%/%monthnum%/%postname%/', '/1999/01/hello/', row).action, 'none');
    assert.deepEqual(permalinkDecision('/%year%/%monthnum%/%postname%/', '/hello', row), {
      action: 'redirect',
      to: '/2026/11/hello/',
      statusCode: 301,
    });
    assert.equal(permalinkDecision('/%year%/%monthnum%/%postname%/', '/2026/11/hello/', { ...row, status: 'DRAFT' }).action, 'none');
  });
});

describe('seo', () => {
  it('builds open graph, twitter, json-ld, canonical, and robots', () => {
    const doc = buildSeoDocument({
      siteTitle: 'OpenPress',
      siteUrl: 'https://example.com',
      blogPublic: true,
      title: 'Hello',
      description: 'A post',
      permalink: '/2026/11/hello/',
      type: 'POST',
      coverImage: '/uploads/cover.jpg',
      authorName: 'Ada',
      seo: { robots: 'noindex, follow', canonical: 'https://example.com/hello/' },
      alternates: [{ locale: 'en', permalink: '/hello/' }, { locale: 'fr', permalink: '/bonjour/' }],
    });
    assert.equal(doc.canonical, 'https://example.com/hello/');
    assert.equal(doc.robots, 'noindex, follow');
    assert.equal(doc.openGraph.images?.[0], 'https://example.com/uploads/cover.jpg');
    assert.equal(doc.twitter.card, 'summary_large_image');
    assert.equal(doc.jsonLd['@type'], 'Article');
    assert.equal(doc.hreflang[1].href, 'https://example.com/bonjour/');
    const hidden = buildSeoDocument({
      siteTitle: 'OpenPress',
      siteUrl: 'https://example.com',
      blogPublic: false,
      title: 'Secret',
      permalink: '/secret/',
      type: 'PAGE',
    });
    assert.equal(hidden.robots, 'noindex, nofollow');
    assert.equal(hidden.jsonLd['@type'], 'WebPage');
  });
});

describe('srcset and templates', () => {
  it('builds width candidates and a template hierarchy', () => {
    const srcset = buildSrcSet(
      { url: '/uploads/full.jpg', width: 1600 },
      {
        medium: { url: '/uploads/medium.jpg', width: 300, formats: { webp: { url: '/uploads/medium.webp' } } },
      },
    );
    assert.match(srcset, /medium\.jpg 300w/);
    assert.match(srcset, /full\.jpg 1600w/);
    const webp = buildSrcSet({ url: '/uploads/full.jpg', width: 1600 }, {
      medium: { url: '/uploads/medium.jpg', width: 300, formats: { webp: { url: '/uploads/medium.webp' } } },
    }, 'webp');
    assert.equal(webp, '/uploads/medium.webp 300w');
    assert.deepEqual(templateCandidates({ kind: 'single', postType: 'post', slug: 'hello' }).slice(0, 2), [
      'single-post-hello',
      'single-post',
    ]);
    assert.equal(templateCandidates({ kind: 'archive', taxonomy: 'category', term: 'news' })[0], 'archive-category-news');
  });
});

describe('revision diff and css', () => {
  it('aligns inserted lines and strips dangerous css', () => {
    const rows = diffLines(['Title: A', 'Hello'], ['Title: A', 'Hello', 'World']);
    assert.equal(rows.filter((row) => row.kind === 'ins').length, 1);
    assert.equal(sanitizeCss('body{color:red}@import "x";</style><script>'), 'body{color:red}');
  });
});

describe('passkey client data', () => {
  it('reads the challenge from a webauthn clientDataJSON payload', () => {
    const challenge = 'abc-challenge';
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url');
    assert.equal(clientDataChallenge(clientDataJSON), challenge);
    assert.equal(clientDataChallenge('not-json'), '');
  });
});

describe('api scopes', () => {
  it('limits keys to the scopes they were given', () => {
    assert.equal(scopeAllows(['content:read'], 'GET', '/api/content'), true);
    assert.equal(scopeAllows(['content:read'], 'POST', '/api/content'), false);
    assert.equal(scopeAllows(['content:read'], 'POST', '/api/graphql'), true);
    assert.equal(scopeAllows(['mcp'], 'POST', '/api/mcp'), true);
    assert.equal(scopeAllows(['*'], 'POST', '/api/auth/login'), false);
    assert.equal(scopeAllows(['media:write'], 'POST', '/api/media/upload'), true);
  });
});

describe('totp', () => {
  it('verifies a code for the same time step and round-trips encryption', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const at = 59_000;
    const code = totpCode(secret, at);
    assert.equal(code.length, 6);
    assert.equal(verifyTotp(secret, code, at), true);
    assert.equal(verifyTotp(secret, '000000', at), false);
    const stored = encryptTotpSecret(secret, 'jwt-secret');
    assert.equal(decryptTotpSecret(stored, 'jwt-secret'), secret);
  });
});

describe('emdash and wxr comments', () => {
  it('parses an emdash dump and a mapped record list', () => {
    const entries = parseEmDash({
      format: 'emdash',
      entries: [{ title: 'Hello', html: '<p>Body</p>', status: 'published', categories: ['News'] }],
    });
    assert.equal(entries[0].status, 'PUBLISHED');
    assert.equal(entries[0].categories[0], 'News');
    assert.equal((entries[0].blocks[0] as { type: string }).type, 'paragraph');
    const mapped = parseEmDash(
      { records: [{ headline: 'Mapped', copy: '<p>Text</p>' }] },
      { title: 'headline', body: 'copy' },
    );
    assert.equal(mapped[0].title, 'Mapped');
    assert.equal(htmlToBlocks('<p>One</p><p>Two</p>').length, 2);
  });

  it('keeps comment parent ids and pending status from wxr', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item>
      <title>Pending</title><wp:post_name>pending</wp:post_name><wp:post_type>post</wp:post_type><wp:status>pending</wp:status>
      <content:encoded><![CDATA[Hi]]></content:encoded>
      <wp:comment><wp:comment_id>10</wp:comment_id><wp:comment_parent>0</wp:comment_parent><wp:comment_author>Ada</wp:comment_author><wp:comment_content>Parent</wp:comment_content><wp:comment_approved>1</wp:comment_approved></wp:comment>
      <wp:comment><wp:comment_id>11</wp:comment_id><wp:comment_parent>10</wp:comment_parent><wp:comment_author>Bea</wp:comment_author><wp:comment_content>Child</wp:comment_content><wp:comment_approved>0</wp:comment_approved></wp:comment>
    </item></channel></rss>`;
    const [item] = parseWxr(xml);
    assert.equal(item.status, 'PENDING');
    assert.equal(item.comments?.[1].parent, '10');
    assert.equal(item.comments?.[1].approved, false);
  });
});
