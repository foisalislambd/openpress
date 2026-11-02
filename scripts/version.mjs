/**
 * Parse VERSION.md, compare semver, and bump the release version.
 * VERSION.md contains only the current version.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION_FILE = join(ROOT, 'VERSION.md');

/** package.json files whose versions follow VERSION.md. */
export const PUBLISHED_PACKAGES = [
  'packages/plugin-sdk/package.json',
  'packages/theme-sdk/package.json',
  'packages/create-openpress/package.json',
];

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemver(input) {
  const raw = String(input).trim();
  const match = SEMVER.exec(raw);
  if (!match) {
    throw new Error(
      `Invalid semver "${raw}". Use MAJOR.MINOR.PATCH with an optional prerelease, for example 1.0.0-beta.1.`,
    );
  }
  const prerelease = match[4] ? match[4].split('.').map(parseIdentifier) : [];
  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

function parseIdentifier(id) {
  if (!/^[0-9A-Za-z-]+$/.test(id)) {
    throw new Error(`Invalid prerelease identifier "${id}".`);
  }
  if (/^\d+$/.test(id)) {
    if (id.length > 1 && id.startsWith('0')) {
      throw new Error(`Numeric prerelease identifier "${id}" cannot have a leading zero.`);
    }
    return { numeric: true, value: Number(id), raw: id };
  }
  return { numeric: false, value: id, raw: id };
}

export function compareSemver(left, right) {
  return compareParsed(parseSemver(left), parseSemver(right));
}

function compareParsed(left, right) {
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (!a) return -1;
    if (!b) return 1;
    if (a.numeric && b.numeric && a.value !== b.value) return a.value < b.value ? -1 : 1;
    if (a.numeric !== b.numeric) return a.numeric ? -1 : 1;
    if (a.raw !== b.raw) return a.raw < b.raw ? -1 : 1;
  }
  return 0;
}

/**
 * Same rules as `npm version` / node-semver:
 * a prerelease patch/minor/major promotes to the release when that bump
 * would not move past the prerelease's own numbers.
 */
export function bumpSemver(version, kind) {
  if (kind !== 'patch' && kind !== 'minor' && kind !== 'major') {
    throw new Error('Bump kind must be patch, minor, or major.');
  }
  const current = parseSemver(version);
  let { major, minor, patch } = current;
  const prerelease = current.prerelease.length > 0;
  if (kind === 'major') {
    if (minor !== 0 || patch !== 0 || !prerelease) major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === 'minor') {
    if (patch !== 0 || !prerelease) minor += 1;
    patch = 0;
  } else if (!prerelease) {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

export function distTag(version) {
  return parseSemver(version).prerelease.length > 0 ? 'next' : 'latest';
}

/** Floating Docker tags move on a stable release. Prereleases keep an exact tag only. */
export function dockerTags(version) {
  const parsed = parseSemver(version);
  const tags = [parsed.raw];
  if (parsed.prerelease.length === 0) {
    tags.push(`${parsed.major}.${parsed.minor}`, String(parsed.major), 'latest');
  }
  return tags;
}

function meaningfulLines(text) {
  const lines = [];
  let comment = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!comment && trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) comment = true;
      continue;
    }
    if (comment) {
      if (trimmed.includes('-->')) comment = false;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    lines.push(trimmed);
  }
  return lines;
}

/** VERSION.md is one semver line, plus an optional one-line comment. */
export function parseVersionFile(text) {
  const lines = meaningfulLines(text);
  if (lines.length !== 1) {
    throw new Error(
      'VERSION.md must contain only the current version: one strict semver line, and optionally one short comment.',
    );
  }
  try {
    return { version: parseSemver(lines[0]).raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`VERSION.md must contain only the current version. ${message}`);
  }
}

export function bumpDocument(text, kind) {
  const next = bumpSemver(parseVersionFile(text).version, kind);
  const comment = text.split(/\r?\n/).find((line) => line.trim().startsWith('<!--') && line.includes('-->'));
  return comment ? `${comment.trim()}\n${next}\n` : `${next}\n`;
}

export function decideRelease(version, tagNames, options = {}) {
  const parsed = parseSemver(version);
  const tags = [];
  for (const name of tagNames) {
    if (!name.startsWith('v')) continue;
    try {
      tags.push({ tag: name, sem: parseSemver(name.slice(1)) });
    } catch {
      // Ignore tags that are not strict semver, such as v1 or vlatest.
    }
  }
  tags.sort((a, b) => compareParsed(a.sem, b.sem));
  const highest = tags.at(-1) ?? null;
  const comparison = highest ? compareParsed(parsed, highest.sem) : 1;
  const previous = [...tags].reverse().find((tag) => compareParsed(tag.sem, parsed) < 0) ?? null;
  const base = {
    version: parsed.raw,
    tag: `v${parsed.raw}`,
    prerelease: parsed.prerelease.length > 0,
    major: String(parsed.major),
    minor: `${parsed.major}.${parsed.minor}`,
    previousTag: previous?.tag ?? '',
    highestTag: highest?.tag ?? '',
  };
  if (comparison < 0) {
    return {
      ...base,
      release: false,
      reason: `Version ${parsed.raw} is lower than ${highest.tag}. Nothing to publish.`,
    };
  }
  if (comparison === 0 && !options.retry) {
    return {
      ...base,
      release: false,
      reason: `Version ${parsed.raw} matches ${highest.tag}. Nothing to publish. Run the workflow manually with retry enabled to publish this version again.`,
    };
  }
  return {
    ...base,
    release: true,
    reason:
      comparison === 0
        ? `Retrying ${parsed.raw}. Existing tag ${highest.tag} will be reused.`
        : `Version ${parsed.raw} is higher than ${highest ? highest.tag : 'every existing tag'}.`,
  };
}

export function readVersionFile(path = VERSION_FILE) {
  return parseVersionFile(readFileSync(path, 'utf8'));
}

export function syncPackageVersions(version, root = ROOT) {
  const parsed = parseSemver(version).raw;
  for (const relative of PUBLISHED_PACKAGES) {
    const path = join(root, relative);
    const json = JSON.parse(readFileSync(path, 'utf8'));
    json.version = parsed;
    writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  }
  const manifestPath = join(root, 'apps/api/src/extensions/plugin-manifest.ts');
  const manifest = readFileSync(manifestPath, 'utf8');
  const next = manifest.replace(
    /const FALLBACK_OPENPRESS_VERSION = '[^']*'/,
    `const FALLBACK_OPENPRESS_VERSION = '${parsed}'`,
  );
  if (next === manifest) throw new Error('Could not update FALLBACK_OPENPRESS_VERSION in plugin-manifest.ts.');
  writeFileSync(manifestPath, next);
  return parsed;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'check') {
    const doc = readVersionFile(args[0] || VERSION_FILE);
    console.log(`VERSION.md is valid: ${doc.version}`);
    return;
  }
  if (command === 'parse') {
    const doc = args[0] ? parseVersionFile(readFileSync(args[0], 'utf8')) : readVersionFile();
    process.stdout.write(`${JSON.stringify({ version: doc.version })}\n`);
    return;
  }
  if (command === 'compare') {
    process.stdout.write(`${compareSemver(args[0], args[1])}\n`);
    return;
  }
  if (command === 'bump') {
    const kind = args[0];
    const text = readFileSync(VERSION_FILE, 'utf8');
    const nextText = bumpDocument(text, kind);
    writeFileSync(VERSION_FILE, nextText);
    const version = parseVersionFile(nextText).version;
    syncPackageVersions(version);
    console.log(`Version is now ${version}. Release notes are generated from commits when this merges to main.`);
    return;
  }
  if (command === 'sync') {
    const version = readVersionFile().version;
    syncPackageVersions(version);
    console.log(`Synced package versions to ${version}.`);
    return;
  }
  if (command === 'warn-bump') {
    const basePath = args[0];
    let base = null;
    if (basePath) {
      try {
        base = parseVersionFile(readFileSync(basePath, 'utf8')).version;
      } catch (error) {
        console.log(`::warning::Base VERSION.md could not be parsed (${error.message}).`);
      }
    }
    const head = readVersionFile().version;
    if (!base) {
      console.log(`::notice::This branch sets VERSION.md to ${head}.`);
      return;
    }
    const comparison = compareSemver(head, base);
    if (comparison === 0) {
      console.log(
        `::warning title=Version was not bumped::VERSION.md is still ${head}. Run \`pnpm release:bump patch|minor|major\` when this pull request should publish a release.`,
      );
      return;
    }
    if (comparison < 0) {
      console.log(
        `::warning title=Version went backwards::VERSION.md moved from ${base} to ${head}. A lower version is not published.`,
      );
      return;
    }
    console.log(`Version moves from ${base} to ${head}.`);
    return;
  }
  if (command === 'decide') {
    const retry = args.includes('--retry');
    const tags = args.filter((arg) => arg !== '--retry');
    const decision = decideRelease(readVersionFile().version, tags, { retry });
    const output = process.env.GITHUB_OUTPUT;
    const lines = [
      `release=${decision.release ? 'true' : 'false'}`,
      `version=${decision.version}`,
      `tag=${decision.tag}`,
      `prerelease=${decision.prerelease ? 'true' : 'false'}`,
      `major=${decision.major}`,
      `minor=${decision.minor}`,
      `previous_tag=${decision.previousTag}`,
      `reason=${decision.reason}`,
    ];
    console.log(decision.reason);
    if (output) writeFileSync(output, `${lines.join('\n')}\n`, { flag: 'a' });
    return;
  }
  if (command === 'docker-tags') {
    const version = args[0] || readVersionFile().version;
    process.stdout.write(`${dockerTags(version).join('\n')}\n`);
    return;
  }
  throw new Error(
    'Usage: node scripts/version.mjs <check|parse|compare|bump|sync|warn-bump|decide|docker-tags>',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
