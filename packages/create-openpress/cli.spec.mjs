import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_DATABASE_URL,
  assertPnpmVersion,
  copyTree,
  envQuote,
  main,
  parseArgs,
  parseDatabaseUrl,
  parsePnpmVersion,
  patchRootPackageJson,
  pluginFiles,
  redactSecrets,
  renderApiEnv,
  renderCompose,
  shouldSkipFile,
} from './lib/scaffold.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');
const bin = join(here, 'bin/create-openpress.mjs');
const releaseWorkflow = join(repoRoot, '.github/workflows/release.yml');

function captureIo() {
  const lines = [];
  return {
    lines,
    text: () => lines.join('\n'),
    log: (message) => lines.push(String(message)),
    error: (message) => lines.push(String(message)),
    stdout: (message) => lines.push(String(message)),
    isTTY: false,
    prompt: async () => {
      throw new Error('prompted in a non-interactive test');
    },
  };
}

function outputOf(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

test('pins GHCR images to a strict version and rejects injection', () => {
  const compose = renderCompose('1.2.3-beta.1');
  assert.match(compose, /ghcr.io\/foisalislambd\/openpress-api:1\.2\.3-beta\.1/);
  assert.match(compose, /ghcr.io\/foisalislambd\/openpress-web:1\.2\.3-beta\.1/);
  assert.doesNotMatch(compose, /:latest/);
  assert.throws(() => renderCompose('1.2.3\nservices:'), /strict semver/);
  assert.throws(() => renderCompose('latest'), /strict semver/);
  assert.throws(() => renderCompose('1.0'), /strict semver/);
});

test('scaffolds a plugin and refuses to overwrite it', async () => {
  const files = pluginFiles('hello-note');
  assert.match(files['plugin.json'], /"id": "hello-note"/);
  assert.match(files['index.js'], /module\.exports = \{ activate \}/);
  assert.throws(() => pluginFiles('Bad ID'), /lowercase/);
  const dir = mkdtempSync(join(tmpdir(), 'op-plugin-'));
  const io = captureIo();
  await main(['plugin', 'hello-note', dir], io);
  assert.match(readFileSync(join(dir, 'plugin.json'), 'utf8'), /hello-note/);
  await assert.rejects(() => main(['plugin', 'hello-note', dir], io), /already exists/);
  await main(['plugin', 'hello-note', dir, '--force'], io);
  assert.match(readFileSync(join(dir, 'plugin.json'), 'utf8'), /hello-note/);
});

test('help and version do not require a directory', async () => {
  const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
  const io = captureIo();
  await main(['--help'], io);
  await main(['-h'], io);
  assert.match(io.text(), /not published/);
  assert.match(io.text(), /--skip-install/);
  assert.match(io.text(), /--non-interactive/);
  const versionIo = captureIo();
  await main(['--version'], versionIo);
  assert.equal(versionIo.text().trim(), version);
  await assert.rejects(() => main(['--version', 'my-site'], captureIo()), /on its own/);
  await assert.rejects(() => main(['--no-such-flag'], captureIo()), /Unknown option/);
  await assert.rejects(() => main(['--skip-install', '--install', 'site'], captureIo()), /not both/);
  await assert.rejects(() => main(['--non-interactive'], captureIo()), /directory is required/i);
});

test('the bin entry reports help and version and fails closed on a bad flag', () => {
  const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
  const help = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8', shell: false });
  assert.equal(help.status, 0, outputOf(help));
  assert.match(help.stdout, /create-openpress/);
  assert.equal(help.stdout.includes('openpress:openpress@'), false);
  const shown = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8', shell: false });
  assert.equal(shown.status, 0, outputOf(shown));
  assert.equal(shown.stdout.trim(), version);
  const bad = spawnSync(process.execPath, [bin, '--force', join(tmpdir(), 'unused-site')], {
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(bad.status, 1, outputOf(bad));
  assert.match(bad.stderr, /never overwrites/);
});

test('parses project flags without sending them through a shell', () => {
  const parsed = parseArgs([
    '--yes',
    '--skip-install',
    '--database-url',
    'postgresql://user:pass@localhost:5432/openpress',
    '--',
    'my site',
  ]);
  assert.equal(parsed.command, 'scaffold');
  assert.equal(parsed.directory, 'my site');
  assert.equal(parsed.skipInstall, true);
  assert.equal(parsed.databaseUrl, 'postgresql://user:pass@localhost:5432/openpress');
  assert.throws(() => parseDatabaseUrl('mysql://localhost/openpress'), /postgresql/);
  assert.throws(() => parseDatabaseUrl('postgresql://localhost/openpress\nJWT_SECRET=nope'), /newline|character/i);
  assert.equal(envQuote('a"b\\c'), '"a\\"b\\\\c"');
});

test('redacts database URLs and generated secrets', () => {
  const secret = 'supersecretpass';
  const text = `failed postgresql://user:${secret}@db.example:5432/openpress token ${secret}`;
  const redacted = redactSecrets(text, [secret]);
  assert.equal(redacted.includes(secret), false);
  assert.equal(redacted.includes('db.example'), false);
  assert.match(redacted, /postgresql:\/\/\[redacted\]/);
  assert.equal(parsePnpmVersion('10.34.1\n').raw, '10.34.1');
  assert.throws(() => assertPnpmVersion(parsePnpmVersion('9.15.0')), /pnpm 10/);
});

test('copy skips secrets, dependencies, workflows, and the CLI package', () => {
  const source = mkdtempSync(join(tmpdir(), 'op-src-'));
  const dest = mkdtempSync(join(tmpdir(), 'op-dst-'));
  mkdirSync(join(source, 'apps/api'), { recursive: true });
  mkdirSync(join(source, 'node_modules/left-pad'), { recursive: true });
  mkdirSync(join(source, '.github/workflows'), { recursive: true });
  mkdirSync(join(source, 'packages/create-openpress'), { recursive: true });
  mkdirSync(join(source, 'scripts'), { recursive: true });
  writeFileSync(join(source, 'apps/api/.env'), 'DATABASE_URL="postgresql://user:leak@localhost/db"\n');
  writeFileSync(join(source, 'apps/api/.env.example'), 'DATABASE_URL="postgresql://openpress:openpress@localhost:5432/openpress"\n');
  writeFileSync(join(source, 'apps/api/package.json'), '{}\n');
  writeFileSync(join(source, 'node_modules/left-pad/index.js'), 'module.exports = 1;\n');
  writeFileSync(join(source, '.github/workflows/release.yml'), 'npm publish\n');
  writeFileSync(join(source, 'packages/create-openpress/secret.txt'), 'nope\n');
  writeFileSync(join(source, 'scripts/local-postgres.mjs'), 'console.log("local")\n');
  writeFileSync(join(source, 'scripts/version.mjs'), 'publish()\n');
  writeFileSync(join(source, 'README.md'), 'hello\n');
  const copied = copyTree(source, dest);
  assert.equal(copied >= 4, true);
  assert.equal(exists(join(dest, 'apps/api/.env')), false);
  assert.match(readFileSync(join(dest, 'apps/api/.env.example'), 'utf8'), /DATABASE_URL/);
  assert.equal(exists(join(dest, 'node_modules')), false);
  assert.equal(exists(join(dest, '.github')), false);
  assert.equal(exists(join(dest, 'packages/create-openpress')), false);
  assert.equal(exists(join(dest, 'scripts/version.mjs')), false);
  assert.match(readFileSync(join(dest, 'scripts/local-postgres.mjs'), 'utf8'), /local/);
  assert.equal(shouldSkipFile('apps/api/.env'), true);
  assert.equal(shouldSkipFile('apps/api/.env.example'), false);
});

test('scaffolds a project into a path with spaces and never overwrites it', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'op space '));
  const dest = join(parent, 'my site $(touch pwned)');
  const io = captureIo();
  await main(['--yes', '--non-interactive', '--skip-install', dest], io);
  assert.equal(exists(join(parent, 'pwned')), false);
  assert.equal(exists(join(process.cwd(), 'pwned')), false);
  assert.equal(exists(join(dest, 'apps/api/package.json')), true);
  assert.equal(exists(join(dest, 'apps/web/package.json')), true);
  assert.equal(exists(join(dest, 'pnpm-lock.yaml')), true);
  assert.equal(exists(join(dest, 'packages/shared/package.json')), true);
  assert.equal(exists(join(dest, 'packages/themes/default/package.json')), true);
  assert.equal(exists(join(dest, 'apps/api/db/migrations/001_init.sql')), true);
  assert.equal(exists(join(dest, 'scripts/local-postgres.mjs')), true);
  const seed = readFileSync(join(dest, 'apps/api/db/seed.ts'), 'utf8');
  assert.match(seed, /ON CONFLICT \("siteId", slug\)/);
  assert.doesNotMatch(seed, /ON CONFLICT \(slug\)/);
  assert.equal(exists(join(dest, 'packages/create-openpress/package.json')), false);
  assert.equal(exists(join(dest, '.github/workflows/release.yml')), false);
  assert.equal(exists(join(dest, 'node_modules')), false);
  assert.equal(exists(join(dest, 'docker-compose.yml')), true);
  const env = readFileSync(join(dest, 'apps/api/.env'), 'utf8');
  assert.match(env, /JWT_SECRET="[a-f0-9]{64}"/);
  assert.match(env, /JWT_REFRESH_SECRET="[a-f0-9]{64}"/);
  assert.doesNotMatch(env, /change-me/);
  assert.match(env, new RegExp(`DATABASE_URL="${LOCAL_DATABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.equal((statSync(join(dest, 'apps/api/.env')).mode & 0o777) === 0o600, true);
  const output = io.text();
  assert.equal(output.includes(LOCAL_DATABASE_URL), false);
  assert.equal(output.includes('postgresql://'), false);
  const jwt = /JWT_SECRET="([a-f0-9]{64})"/.exec(env)[1];
  assert.equal(output.includes(jwt), false);
  const setup = readFileSync(join(dest, 'SETUP.md'), 'utf8');
  assert.equal(setup.includes(jwt), false);
  assert.equal(setup.includes('postgresql://'), false);
  assert.match(setup, /pnpm db:migrate/);
  assert.match(setup, /pnpm dev/);
  assert.match(setup, /not published/);
  const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['release:bump'], undefined);
  assert.equal(pkg.scripts['test:release'], undefined);
  assert.match(pkg.scripts.test, /@openpress\/api/);
  assert.match(readFileSync(join(dest, 'README.md'), 'utf8'), /create-openpress-scaffold/);
  const git = spawnSync('git', ['init'], { cwd: dest, encoding: 'utf8', shell: false });
  assert.equal(git.status, 0, outputOf(git));
  assert.equal(spawnSync('git', ['check-ignore', '-q', 'apps/api/.env'], { cwd: dest, shell: false }).status, 0);
  assert.equal(spawnSync('git', ['check-ignore', '-q', 'apps/web/.env'], { cwd: dest, shell: false }).status, 0);
  assert.notEqual(
    spawnSync('git', ['check-ignore', '-q', 'apps/api/.env.example'], { cwd: dest, shell: false }).status,
    0,
  );
  const before = readFileSync(join(dest, 'apps/api/.env'), 'utf8');
  await assert.rejects(() => main(['--yes', '--skip-install', dest], captureIo()), /not empty/);
  assert.equal(readFileSync(join(dest, 'apps/api/.env'), 'utf8'), before);
  assert.equal(readFileSync(join(dest, 'apps/api/package.json'), 'utf8').includes('@openpress/api'), true);
});

test('refuses a non-empty directory, a file, the source tree, and a database command without install', async () => {
  const full = mkdtempSync(join(tmpdir(), 'op-full-'));
  writeFileSync(join(full, 'keep.txt'), 'mine');
  await assert.rejects(() => main(['--yes', '--skip-install', full], captureIo()), /not empty/);
  assert.equal(readFileSync(join(full, 'keep.txt'), 'utf8'), 'mine');
  assert.equal(exists(join(full, 'package.json')), false);

  const fileParent = mkdtempSync(join(tmpdir(), 'op-file-'));
  const file = join(fileParent, 'not-a-dir');
  writeFileSync(file, 'x');
  await assert.rejects(() => main(['--yes', '--skip-install', file], captureIo()), /not a directory/);
  assert.equal(readFileSync(file, 'utf8'), 'x');

  const inside = join(repoRoot, 'tmp-create-openpress-site');
  await assert.rejects(() => main(['--yes', '--skip-install', inside], captureIo()), /source tree/);
  assert.equal(exists(inside), false);

  const missingParent = join(tmpdir(), `op-missing-${process.pid}`, 'site');
  await assert.rejects(() => main(['--yes', '--skip-install', missingParent], captureIo()), /parent directory/i);

  const migrateDest = join(mkdtempSync(join(tmpdir(), 'op-mig-')), 'site');
  await assert.rejects(() => main(['--yes', '--skip-install', '--migrate', migrateDest], captureIo()), /skip-install/);
  assert.equal(exists(migrateDest), false);
});

test('writes a custom database URL only to the gitignored env file', async () => {
  const dest = join(mkdtempSync(join(tmpdir(), 'op-db-')), 'site');
  const url = 'postgresql://scaffold_user:supersecretpass@db.example:5432/openpress';
  const io = captureIo();
  await main(['--yes', '--non-interactive', '--skip-install', '--database-url', url, dest], io);
  assert.equal(io.text().includes('supersecretpass'), false);
  assert.equal(io.text().includes('db.example'), false);
  assert.equal(io.text().includes('postgresql://'), false);
  const env = readFileSync(join(dest, 'apps/api/.env'), 'utf8');
  assert.match(env, /DATABASE_URL="postgresql:\/\/scaffold_user:supersecretpass@db\.example:5432\/openpress"/);
  assert.equal(readFileSync(join(dest, 'SETUP.md'), 'utf8').includes('supersecretpass'), false);
  assert.match(readFileSync(join(dest, 'apps/web/.env'), 'utf8'), /NEXT_PUBLIC_API_URL/);
  await assert.rejects(
    () => main(['--yes', '--skip-install', join(dest, 'other'), '--database-url', 'http://localhost/db'], captureIo()),
    /postgresql/,
  );
});

test('an interactive decline writes nothing', async () => {
  const dest = join(mkdtempSync(join(tmpdir(), 'op-ask-')), 'site');
  const io = captureIo();
  io.isTTY = true;
  io.prompt = async (question) => {
    if (question.startsWith('Project directory')) return dest;
    if (question.startsWith('PostgreSQL')) return '';
    if (question.startsWith('Run pnpm db:migrate')) return 'n';
    if (question.startsWith('Run pnpm db:seed')) return 'n';
    if (question.startsWith('Continue')) return 'n';
    throw new Error(`unexpected prompt: ${question}`);
  };
  await assert.rejects(() => main(['--skip-install'], io), (error) => error.code === 'CANCELLED');
  assert.equal(exists(dest), false);
  assert.equal(io.text().includes('postgresql://'), false);
});

test('cancellation during copy removes a directory this command created', async () => {
  const dest = join(mkdtempSync(join(tmpdir(), 'op-abort-')), 'site');
  const abort = new AbortController();
  await assert.rejects(
    () =>
      main(['--yes', '--skip-install', dest], captureIo(), {
        signal: abort.signal,
        onFile() {
          abort.abort();
        },
      }),
    (error) => error.code === 'CANCELLED',
  );
  assert.equal(exists(dest), false);
});

test('root package scripts in a generated project do not bump or publish', () => {
  const patched = patchRootPackageJson({
    name: 'openpress',
    scripts: {
      test: 'pnpm --filter @openpress/api test && pnpm test:release',
      'test:release': 'node --test scripts/version.spec.mjs',
      'release:bump': 'node scripts/version.mjs bump',
      dev: 'turbo run dev',
    },
  });
  assert.equal(patched.scripts['release:bump'], undefined);
  assert.equal(patched.scripts['test:release'], undefined);
  assert.equal(patched.scripts.dev, 'turbo run dev');
  assert.match(patched.scripts.test, /@openpress\/api test/);
  const env = renderApiEnv('DATABASE_URL="old"\nJWT_SECRET="old"\nJWT_REFRESH_SECRET="old"\n', {
    databaseUrl: 'postgresql://user:secret@localhost:5432/openpress',
    jwtSecret: 'abc',
    jwtRefreshSecret: 'def',
  });
  assert.match(env, /JWT_SECRET="abc"/);
  assert.doesNotMatch(env, /JWT_SECRET="old"/);
});

test('the release workflow still publishes the SDKs and cannot publish create-openpress', () => {
  const workflow = readFileSync(releaseWorkflow, 'utf8');
  const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.publishConfig, undefined);
  assert.match(workflow, /npm publish --access public --provenance --tag "\$\{tag\}" --ignore-scripts "\$\{dir\}"/);
  assert.match(workflow, /for dir in packages\/plugin-sdk packages\/theme-sdk; do/);
  assert.doesNotMatch(workflow, /for dir in[^\n]*create-openpress/);
  assert.match(workflow, /create-openpress is source-only/);
  assert.match(workflow, /node packages\/create-openpress\/bin\/create-openpress\.mjs compose/);
  const ci = readFileSync(join(repoRoot, '.github/workflows/create-openpress.yml'), 'utf8');
  assert.match(ci, /contents: read/);
  assert.doesNotMatch(ci, /npm publish/);
  assert.doesNotMatch(ci, /registry-url/);
});

test('a packed tarball scaffolds the current API and web source', { timeout: 120_000 }, async () => {
  const packDir = mkdtempSync(join(tmpdir(), 'op-pack-'));
  const packed = spawnSync(
    'pnpm',
    ['--filter', 'create-openpress', 'pack', '--pack-destination', packDir],
    { cwd: repoRoot, encoding: 'utf8', shell: false },
  );
  assert.equal(packed.status, 0, outputOf(packed));
  assert.equal(exists(join(here, 'template')), false);
  const tarball = readdirSync(packDir).find((name) => name.endsWith('.tgz'));
  assert.ok(tarball);
  const extract = mkdtempSync(join(tmpdir(), 'op-extract-'));
  const tar = spawnSync('tar', ['-xzf', join(packDir, tarball), '-C', extract], { encoding: 'utf8', shell: false });
  assert.equal(tar.status, 0, outputOf(tar));
  assert.equal(exists(join(extract, 'package/template/apps/api/package.json')), true);
  assert.equal(exists(join(extract, 'package/template/apps/web/package.json')), true);
  assert.equal(exists(join(extract, 'package/template/pnpm-lock.yaml')), true);
  assert.equal(exists(join(extract, 'package/template/node_modules')), false);
  assert.equal(exists(join(extract, 'package/template/.github')), false);
  assert.equal(exists(join(extract, 'package/template/apps/api/.env')), false);
  const parent = mkdtempSync(join(tmpdir(), 'op tarball '));
  const dest = join(parent, 'my site');
  const run = spawnSync(
    process.execPath,
    [join(extract, 'package/bin/create-openpress.mjs'), '--yes', '--non-interactive', '--skip-install', dest],
    { encoding: 'utf8', shell: false },
  );
  assert.equal(run.status, 0, outputOf(run));
  assert.equal(`${run.stdout}${run.stderr}`.includes('postgresql://'), false);
  assert.equal(exists(join(dest, 'apps/api/db/migrations/001_init.sql')), true);
  assert.equal(exists(join(dest, 'apps/web/package.json')), true);
  assert.equal(exists(join(dest, 'packages/shared/package.json')), true);
  assert.equal(exists(join(dest, 'SETUP.md')), true);
});

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
