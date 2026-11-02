import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  PUBLISHED_PACKAGES,
  bumpDocument,
  bumpSemver,
  compareSemver,
  decideRelease,
  distTag,
  dockerTags,
  parseSemver,
  parseVersionFile,
  syncPackageVersions,
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

function versionFixture(manifest) {
  const root = mkdtempSync(join(tmpdir(), 'openpress-version-'));
  for (const relative of PUBLISHED_PACKAGES) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ name: 'fixture', version: '0.0.1' }, null, 2)}\n`);
  }
  const manifestPath = join(root, 'apps/api/src/extensions/plugin-manifest.ts');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, manifest);
  return { root, manifestPath };
}

test('sync leaves an already-current fallback alone and still updates packages', () => {
  const source = "/** Fallback kept in sync by pnpm release:bump. */\nconst FALLBACK_OPENPRESS_VERSION = '0.3.0';\n";
  const { root, manifestPath } = versionFixture(source);
  try {
    assert.equal(syncPackageVersions('0.3.0', root), '0.3.0');
    assert.equal(readFileSync(manifestPath, 'utf8'), source);
    for (const relative of PUBLISHED_PACKAGES) {
      assert.equal(JSON.parse(readFileSync(join(root, relative), 'utf8')).version, '0.3.0');
    }
    const before = readFileSync(join(root, PUBLISHED_PACKAGES[0]), 'utf8');
    assert.equal(syncPackageVersions('0.3.0', root), '0.3.0');
    assert.equal(readFileSync(join(root, PUBLISHED_PACKAGES[0]), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sync updates export, type, and quote styles without rewriting them', () => {
  const cases = [
    [
      'export const FALLBACK_OPENPRESS_VERSION = "0.2.0";\n',
      'export const FALLBACK_OPENPRESS_VERSION = "0.3.0";\n',
    ],
    [
      'const FALLBACK_OPENPRESS_VERSION: string = \'0.1.0\';\n',
      'const FALLBACK_OPENPRESS_VERSION: string = \'0.3.0\';\n',
    ],
    [
      'export const FALLBACK_OPENPRESS_VERSION: string = "0.2.9";\n',
      'export const FALLBACK_OPENPRESS_VERSION: string = "0.3.0";\n',
    ],
  ];
  for (const [source, expected] of cases) {
    const { root, manifestPath } = versionFixture(`prefix\n${source}suffix\n`);
    try {
      syncPackageVersions('0.3.0', root);
      assert.equal(readFileSync(manifestPath, 'utf8'), `prefix\n${expected}suffix\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('sync still fails when the fallback declaration is missing', () => {
  const { root } = versionFixture('const OTHER = "0.3.0";\n');
  try {
    assert.throws(
      () => syncPackageVersions('0.3.0', root),
      /Could not update FALLBACK_OPENPRESS_VERSION/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
