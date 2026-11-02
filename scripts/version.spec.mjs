import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bumpDocument,
  bumpSemver,
  compareSemver,
  decideRelease,
  distTag,
  dockerTags,
  parseSemver,
  parseVersionFile,
} from './version.mjs';

const SAMPLE = `<!-- The only version line is the current OpenPress release. -->
0.3.0
`;

test('parses strict semver and rejects leading zeros', () => {
  assert.deepEqual(
    { ...parseSemver('1.0.0-beta.1'), prerelease: parseSemver('1.0.0-beta.1').prerelease.map((id) => id.raw) },
    { raw: '1.0.0-beta.1', major: 1, minor: 0, patch: 0, prerelease: ['beta', '1'] },
  );
  assert.throws(() => parseSemver('1.0'), /Invalid semver/);
  assert.throws(() => parseSemver('01.0.0'), /Invalid semver/);
  assert.throws(() => parseSemver('1.0.0-01'), /leading zero/);
  assert.throws(() => parseSemver('v1.0.0'), /Invalid semver/);
});

test('compares equal, lower, higher, and prerelease versions', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.1'), -1);
  assert.equal(compareSemver('1.0.1', '1.0.0'), 1);
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('1.0.0-beta.1', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-beta.1'), 1);
  assert.equal(compareSemver('1.0.0-beta.1', '1.0.0-beta.2'), -1);
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.10'), -1);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-beta'), -1);
  assert.equal(compareSemver('1.0.0-beta.1', '1.0.0-rc.1'), -1);
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0-1', '1.0.0-a'), -1);
  assert.equal(compareSemver('0.3.0-beta.1', '0.2.9'), 1);
});

test('bumps like npm version', () => {
  assert.equal(bumpSemver('0.3.0', 'patch'), '0.3.1');
  assert.equal(bumpSemver('0.3.0', 'minor'), '0.4.0');
  assert.equal(bumpSemver('0.3.0', 'major'), '1.0.0');
  assert.equal(bumpSemver('1.2.3-beta.1', 'patch'), '1.2.3');
  assert.equal(bumpSemver('1.2.3-beta.1', 'minor'), '1.3.0');
  assert.equal(bumpSemver('1.0.0-beta.1', 'major'), '1.0.0');
  assert.equal(bumpSemver('0.3.0-beta.2', 'minor'), '0.3.0');
  assert.equal(bumpSemver('0.3.0-beta.2', 'major'), '1.0.0');
  assert.throws(() => bumpSemver('0.3.0', 'pre'), /patch, minor, or major/);
});

test('reads a bare version and rejects extra prose', () => {
  assert.equal(parseVersionFile(SAMPLE).version, '0.3.0');
  assert.equal(parseVersionFile('1.0.0-beta.1\n').version, '1.0.0-beta.1');
  assert.throws(() => parseVersionFile('Version: 0.3.0\n'), /only the current version/);
  assert.throws(() => parseVersionFile('0.3.0\n\nShipped plugins.\n'), /only the current version/);
  assert.throws(() => parseVersionFile('## Release notes\n'), /only the current version/);
});

test('bumpDocument replaces the version and keeps the comment line', () => {
  const next = bumpDocument(SAMPLE, 'minor');
  assert.equal(parseVersionFile(next).version, '0.4.0');
  assert.match(next, /only version line/);
  assert.equal(next.trim().split('\n').length, 2);
  assert.equal(parseVersionFile(bumpDocument('0.3.0\n', 'patch')).version, '0.3.1');
});

test('decides whether a version should publish', () => {
  const tags = ['v0.2.0', 'v0.3.0-beta.1', 'v1', 'not-a-release'];
  assert.equal(decideRelease('0.3.0', tags).release, true);
  assert.equal(decideRelease('0.3.0', tags).previousTag, 'v0.3.0-beta.1');
  assert.equal(decideRelease('0.3.0-beta.1', tags).release, false);
  assert.match(decideRelease('0.3.0-beta.1', tags).reason, /matches/);
  assert.equal(decideRelease('0.2.0', tags).release, false);
  assert.match(decideRelease('0.2.0', tags).reason, /lower/);
  assert.equal(decideRelease('0.3.0-beta.1', tags, { retry: true }).release, true);
  assert.equal(decideRelease('0.1.0', []).release, true);
  assert.equal(decideRelease('0.1.0', []).highestTag, '');
  assert.equal(decideRelease('1.0.0-beta.1', ['v0.9.0']).prerelease, true);
});

test('picks the npm dist-tag and docker tags', () => {
  assert.equal(distTag('1.0.0-beta.1'), 'next');
  assert.equal(distTag('1.0.0'), 'latest');
  assert.deepEqual(dockerTags('0.3.0'), ['0.3.0', '0.3', '0', 'latest']);
  assert.deepEqual(dockerTags('1.2.3-rc.1'), ['1.2.3-rc.1']);
});
