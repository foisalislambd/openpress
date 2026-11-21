import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kses } from '../src/html/kses';
import { detectUpload } from '../src/media/upload-sniff';
import { assertRuntimeConfig } from '../src/security/runtime-config';
import { isPublicHostname, isPublicIp, requestPublic } from '../src/security/outbound-url';
import { requiresCsrf } from '../src/auth/csrf-policy';
import { hashRefreshToken } from '../src/auth/refresh-token';
import { safeEqual } from '../src/auth/session-cookie';
import { PUBLISHED_MEDIA_MATCH } from '../src/content/public-media';
import { codeThemesEnabled, themeSourceError } from '../../web/src/lib/code-theme-policy';
import { jsonForScript, safeCss } from '../../web/src/lib/safe-html';

describe('outbound URL policy', () => {
  it('rejects loopback, decimal IPs, and private DNS names', () => {
    assert.equal(isPublicHostname('api.example.com'), true);
    assert.equal(isPublicHostname('8.8.8.8'), true);
    assert.equal(isPublicHostname('127.0.0.1'), false);
    assert.equal(isPublicHostname('2130706433'), false);
    assert.equal(isPublicHostname('0x7f000001'), false);
    assert.equal(isPublicHostname('localhost'), false);
    assert.equal(isPublicHostname('metadata.google.internal'), false);
    assert.equal(isPublicIp('10.1.2.3'), false);
    assert.equal(isPublicIp('169.254.169.254'), false);
    assert.equal(isPublicIp('::1'), false);
    assert.equal(isPublicIp('0:0:0:0:0:0:0:1'), false);
    assert.equal(isPublicIp('8.8.4.4'), true);
  });

  it('does not connect to a loopback URL', async () => {
    await assert.rejects(() => requestPublic('http://127.0.0.1/'), /non-public/);
    await assert.rejects(() => requestPublic('http://2130706433/'), /non-public|Invalid URL/);
    await assert.rejects(() => requestPublic('file:///etc/passwd'), /HTTP\(S\)/);
  });
});

describe('production config', () => {
  it('refuses default secrets and an open CORS origin', () => {
    assert.doesNotThrow(() => assertRuntimeConfig({ NODE_ENV: 'development' }));
    assert.throws(
      () => assertRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'change-me', JWT_REFRESH_SECRET: 'x'.repeat(32), DATABASE_URL: 'postgres://db', WEB_ORIGIN: 'https://example.com' }),
      /JWT_SECRET/,
    );
    assert.throws(
      () =>
        assertRuntimeConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(32),
          JWT_REFRESH_SECRET: 'b'.repeat(32),
          DATABASE_URL: 'postgres://db',
          WEB_ORIGIN: '*',
        }),
      /WEB_ORIGIN/,
    );
    assert.doesNotThrow(() =>
      assertRuntimeConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        DATABASE_URL: 'postgres://db',
        WEB_ORIGIN: 'https://example.com',
      }),
    );
  });
});

describe('uploads and html', () => {
  it('sniffs real file bytes and ignores a spoofed name', () => {
    assert.equal(detectUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(detectUpload(Buffer.from('<html><script>alert(1)</script></html>')), null);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.deepEqual(detectUpload(png), { mime: 'image/png', ext: '.png' });
  });

  it('strips encoded javascript links and script breakouts', () => {
    const html = kses('<a href="&#106;avascript:alert(1)">x</a><p onclick="alert(1)">Hi</p>');
    assert.doesNotMatch(html, /javascript/i);
    assert.doesNotMatch(html, /onclick/i);
    assert.match(html, /<p>Hi<\/p>/);
    const script = jsonForScript({ title: '</script><script>alert(1)</script>' });
    assert.doesNotMatch(script, /<\/script/i);
    const css = safeCss('body{color:red}</style><script>alert(1)</script>');
    assert.doesNotMatch(css, /<|>|script/);
    assert.match(css, /body\{color:red\}/);
  });
});

describe('sessions and code themes', () => {
  it('compares CSRF tokens without treating different lengths as equal', () => {
    assert.equal(safeEqual('abcdef', 'abcdef'), true);
    assert.equal(safeEqual('abcdef', 'abcdeg'), false);
    assert.equal(safeEqual('short', 'longer-token'), false);
  });

  it('requires a CSRF token for browser login before any session cookie exists', () => {
    const base = { headers: {} as Record<string, string> };
    assert.equal(requiresCsrf({ method: 'POST', ...base, headers: { 'x-openpress-client': 'web' } }), true);
    assert.equal(requiresCsrf({ method: 'POST', ...base, headers: { cookie: 'op_access=abc' } }), true);
    assert.equal(requiresCsrf({ method: 'POST', ...base, headers: { authorization: 'Bearer token' } }), false);
    assert.equal(requiresCsrf({ method: 'POST', ...base }), false);
    assert.equal(requiresCsrf({ method: 'GET', ...base, headers: { 'x-openpress-client': 'web' } }), false);
  });

  it('hashes refresh tokens so a rotated token does not match the previous one', () => {
    const first = hashRefreshToken('refresh-a');
    const second = hashRefreshToken('refresh-b');
    assert.equal(first, hashRefreshToken('refresh-a'));
    assert.notEqual(first, second);
    assert.equal(first.length, 64);
  });

  it('lists GraphQL and REST media only when a public post already exposes them', () => {
    assert.match(PUBLISHED_MEDIA_MATCH, /status = 'PUBLISHED'/);
    assert.match(PUBLISHED_MEDIA_MATCH, /visibility = 'PUBLIC'/);
    assert.match(PUBLISHED_MEDIA_MATCH, /coverImage/);
    assert.match(PUBLISHED_MEDIA_MATCH, /m\."siteId"/);
  });

  it('keeps code themes off in production until an operator opts in', () => {
    assert.equal(codeThemesEnabled({ NODE_ENV: 'production' }), false);
    assert.equal(codeThemesEnabled({ NODE_ENV: 'production', OPENPRESS_CODE_THEMES: '1' }), true);
    assert.equal(codeThemesEnabled({ NODE_ENV: 'development' }), true);
    assert.equal(codeThemesEnabled({ NODE_ENV: 'development', OPENPRESS_CODE_THEMES: '0' }), false);
    assert.equal(themeSourceError('const React = require("react"); module.exports = {};'), null);
    assert.match(themeSourceError('process.env.JWT_SECRET') ?? '', /blocked/);
    assert.match(themeSourceError('require("child_process")') ?? '', /blocked/);
  });
});
