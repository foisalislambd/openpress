import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Public local default. The same value is already in apps/api/.env.example. */
export const LOCAL_DATABASE_URL = 'postgresql://openpress:openpress@localhost:5432/openpress';

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const SKIP_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'coverage',
  '.pgdata',
  'uploads',
  '.cursor',
]);

const FLAG_MAP = {
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
  '--yes': 'yes',
  '-y': 'yes',
  '--non-interactive': 'nonInteractive',
  '--skip-install': 'skipInstall',
  '--install': 'install',
  '--skip-env': 'skipEnv',
  '--migrate': 'migrate',
  '--seed': 'seed',
  '--force': 'force',
};

export class CliError extends Error {
  constructor(message, { code = 1 } = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

export function readOwnVersion() {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

export function findCheckoutRoot(start = PACKAGE_ROOT) {
  let dir = resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (isCheckout(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isCheckout(dir) {
  return (
    existsSync(join(dir, 'pnpm-workspace.yaml')) &&
    existsSync(join(dir, 'pnpm-lock.yaml')) &&
    existsSync(join(dir, 'apps/api/package.json')) &&
    existsSync(join(dir, 'apps/web/package.json')) &&
    existsSync(join(dir, 'packages/create-openpress/package.json'))
  );
}

/**
 * A packed tarball has no checkout above it, so it uses the template copied
 * at pack time. Inside this repository the live checkout wins, even if a
 * leftover template directory exists.
 */
export function findSourceRoot(start = PACKAGE_ROOT) {
  const checkout = findCheckoutRoot(start);
  if (checkout) return { root: checkout, kind: 'checkout' };
  const template = join(PACKAGE_ROOT, 'template');
  if (
    existsSync(join(template, 'apps/api/package.json')) &&
    existsSync(join(template, 'apps/web/package.json')) &&
    existsSync(join(template, 'pnpm-lock.yaml'))
  ) {
    return { root: template, kind: 'template' };
  }
  throw new CliError(
    'Could not find the OpenPress source. Run this CLI from a checkout of the GitHub repository, or from a tarball packed with pnpm --filter create-openpress pack. create-openpress is not published to npm.',
  );
}

export function toPosix(rel) {
  return rel.split(sep).join('/');
}

export function shouldSkipDir(rel) {
  if (!rel) return false;
  const posix = toPosix(rel);
  const segments = posix.split('/');
  if (segments.some((segment) => SKIP_SEGMENTS.has(segment))) return true;
  if (posix === 'packages/create-openpress' || posix.startsWith('packages/create-openpress/')) return true;
  if (posix === '.github' || posix.startsWith('.github/')) return true;
  if (posix === 'apps/api/plugins' || posix.startsWith('apps/api/plugins/')) return true;
  if (posix === 'apps/api/themes-store' || posix.startsWith('apps/api/themes-store/')) return true;
  if (
    (posix === 'packages/themes' || posix.startsWith('packages/themes/')) &&
    posix !== 'packages/themes' &&
    posix !== 'packages/themes/default' &&
    !posix.startsWith('packages/themes/default/')
  ) {
    return true;
  }
  if (posix === 'scripts/version.mjs' || posix === 'scripts/version.spec.mjs') return true;
  return false;
}

export function shouldSkipFile(rel) {
  const name = basename(rel);
  if (name === '.env') return true;
  if (name.startsWith('.env.') && name !== '.env.example') return true;
  if (name.endsWith('.tsbuildinfo') || name.endsWith('.log') || name === '.DS_Store') return true;
  const posix = toPosix(rel);
  if (posix === 'scripts/version.mjs' || posix === 'scripts/version.spec.mjs') return true;
  return false;
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw new CliError('Cancelled.', { code: 'CANCELLED' });
}

export function copyTree(source, dest, { signal, onFile } = {}) {
  let count = 0;
  const walk = (rel) => {
    throwIfAborted(signal);
    if (shouldSkipDir(rel) || shouldSkipFile(rel)) return;
    const from = rel ? join(source, rel) : source;
    const to = rel ? join(dest, rel) : dest;
    const stat = lstatSync(from);
    if (stat.isSymbolicLink()) {
      throw new CliError(`Refusing to copy the symbolic link "${toPosix(rel)}".`);
    }
    if (stat.isDirectory()) {
      mkdirSync(to, { recursive: true });
      for (const entry of readdirSync(from)) {
        walk(rel ? join(rel, entry) : entry);
      }
      return;
    }
    if (!stat.isFile()) return;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    count += 1;
    onFile?.(toPosix(rel));
  };
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(source)) walk(entry);
  return count;
}

export function assertNodeVersion(current = process.versions.node) {
  const major = Number(String(current).split('.')[0]);
  if (!Number.isInteger(major) || major < 20) {
    throw new CliError(`Node.js 20 or newer is required. The current version is ${current}.`);
  }
}

export function parsePnpmVersion(output) {
  const line = String(output)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(line ?? '');
  if (!match) throw new CliError('Could not read the pnpm version. Install pnpm 10 or newer and try again.');
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: match[0] };
}

export function assertPnpmVersion(parsed) {
  if (parsed.major < 10) {
    throw new CliError(`pnpm 10 or newer is required. The current version is ${parsed.raw}.`);
  }
  return parsed;
}

export function parseDatabaseUrl(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw new CliError('Pass a postgresql:// URL after --database-url.');
  if (trimmed.length > 2048 || /[\u0000\r\n]/.test(trimmed)) {
    throw new CliError('The database URL contains a character this CLI will not write into an environment file.');
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CliError('The database URL must be a valid postgresql:// or postgres:// URL.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new CliError('The database URL must start with postgresql:// or postgres://.');
  }
  if (!parsed.hostname) throw new CliError('The database URL is missing a host.');
  return trimmed;
}

export function envQuote(value) {
  if (/[\u0000\r\n]/.test(value)) {
    throw new CliError('Refusing to write an environment value that contains a newline.');
  }
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function redactSecrets(text, secrets) {
  let output = String(text);
  const values = [...secrets].filter((secret) => typeof secret === 'string' && secret.length >= 4);
  values.sort((left, right) => right.length - left.length);
  for (const secret of values) output = output.split(secret).join('[redacted]');
  output = output.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[redacted]');
  return output;
}

export function shellQuote(value) {
  if (/[\u0000\r\n]/.test(value)) {
    throw new CliError('The directory path contains a newline, which this CLI refuses to use.');
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function assertSafeDestination(destInput, sourceRoot) {
  if (typeof destInput !== 'string' || destInput.trim() === '') {
    throw new CliError('Pass a project directory. Example: create-openpress ./my-site --yes');
  }
  if (destInput.includes('\u0000')) throw new CliError('The directory path contains a null byte.');
  const dest = resolve(destInput);
  const source = resolve(sourceRoot);
  if (dest === source || dest.startsWith(`${source}${sep}`) || source.startsWith(`${dest}${sep}`)) {
    throw new CliError(
      'Refusing to write the project inside the OpenPress source tree, or over it. Choose an empty directory outside this checkout.',
    );
  }
  const parent = dirname(dest);
  if (!existsSync(parent)) {
    throw new CliError(`The parent directory does not exist: ${parent}`);
  }
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new CliError(`The parent path is not a real directory: ${parent}`);
  }
  if (existsSync(dest)) {
    const stat = lstatSync(dest);
    if (stat.isSymbolicLink()) {
      throw new CliError('Refusing to use a symbolic link as the project directory. Existing files were left untouched.');
    }
    if (!stat.isDirectory()) {
      throw new CliError(`${dest} exists and is not a directory. Existing files were left untouched.`);
    }
    const entries = readdirSync(dest);
    if (entries.length > 0) {
      throw new CliError(`${dest} is not empty. Choose a new or empty directory. Existing files were left untouched.`);
    }
  }
  return dest;
}

export function renderCompose(version) {
  if (!SEMVER.test(version)) {
    throw new CliError(
      `Refusing to render Compose for version "${String(version).split(/\s/)[0]}". Use a strict semver such as 1.0.7 or 1.0.0-beta.1.`,
    );
  }
  return `services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: openpress
      POSTGRES_PASSWORD: openpress
      POSTGRES_DB: openpress
    volumes:
      - pgdata:/var/lib/postgresql/data
  api:
    image: ghcr.io/foisalislambd/openpress-api:${version}
    environment:
      DATABASE_URL: postgresql://openpress:openpress@postgres:5432/openpress
      JWT_SECRET: change-me
      JWT_REFRESH_SECRET: change-me-too
      WEB_ORIGIN: http://localhost:3000
      PORT: 4000
    depends_on:
      - postgres
    ports:
      - "4000:4000"
  web:
    image: ghcr.io/foisalislambd/openpress-web:${version}
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
    depends_on:
      - api
    ports:
      - "3000:3000"

volumes:
  pgdata:
`;
}

export function pluginFiles(id) {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(id)) {
    throw new CliError('Plugin id must be lowercase and start with a letter or number.');
  }
  const title = id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const version = readOwnVersion();
  return {
    'plugin.json': `${JSON.stringify(
      {
        id,
        name: title,
        version: '1.0.0',
        description: `${title} plugin`,
        main: 'index.js',
        requires: { openpress: `>=${version}` },
        permissions: ['shortcodes'],
      },
      null,
      2,
    )}\n`,
    'index.js': `function activate(ctx) {
  ctx.shortcodes.add('${id.replace(/-/g, '_')}', () => '${title}');
}

module.exports = { activate };
`,
  };
}

export function writeNew(dir, files, force) {
  mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    if (existsSync(path) && !force) {
      throw new CliError(`${path} already exists. Pass --force to replace that plugin file.`);
    }
    writeFileSync(path, contents);
  }
}

export function scaffoldPlugin(id, dir, force = false) {
  writeNew(dir, pluginFiles(id), force);
}

export function patchRootPackageJson(pkg) {
  const scripts = { ...(pkg.scripts ?? {}) };
  scripts.test = 'pnpm --filter @openpress/api test';
  delete scripts['test:release'];
  delete scripts['release:bump'];
  return { ...pkg, scripts };
}

export function renderApiEnv(example, { databaseUrl, jwtSecret, jwtRefreshSecret }) {
  const replaceLine = (text, key, value) => {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (!pattern.test(text)) {
      throw new CliError(`apps/api/.env.example is missing ${key}.`);
    }
    return text.replace(pattern, `${key}=${envQuote(value)}`);
  };
  let text = example;
  text = replaceLine(text, 'DATABASE_URL', databaseUrl);
  text = replaceLine(text, 'JWT_SECRET', jwtSecret);
  text = replaceLine(text, 'JWT_REFRESH_SECRET', jwtRefreshSecret);
  return text.endsWith('\n') ? text : `${text}\n`;
}

export function renderSetup(info) {
  const directory = shellQuote(info.directory);
  const installStep = info.skipInstall
    ? `Dependencies were not installed. From the project directory, run:\n\n\`\`\`bash\npnpm install --frozen-lockfile\n\`\`\`\n`
    : `Dependencies were installed with \`pnpm install --frozen-lockfile\`.\n`;
  const envStep = info.skipEnv
    ? `Environment files were not written. Copy the examples yourself and choose your own secrets:\n\n\`\`\`bash\ncp apps/api/.env.example apps/api/.env\ncp apps/web/.env.example apps/web/.env\n\`\`\`\n\nReplace the JWT placeholders in \`apps/api/.env\`. Do not commit that file.\n`
    : `\`apps/api/.env\` and \`apps/web/.env\` were written locally. \`apps/api/.env\` is mode 0600 and contains generated JWT secrets. Both files match patterns in \`.gitignore\`. This file does not repeat those secrets or the database URL.\n\n${
        info.customDatabase
          ? 'The PostgreSQL URL you passed in was saved to `apps/api/.env`.\n'
          : 'The database setting is the local development default from `apps/api/.env.example`. Change it before any shared or production deploy.\n'
      }`;
  const migrateStep = info.migrate
    ? 'This command ran `pnpm db:migrate`. That applies pending SQL files. It does not drop the database.\n'
    : 'Migrations were not run.\n';
  const seedStep = info.seed
    ? 'This command ran `pnpm db:seed`.\n'
    : 'The database seed was not run.\n';
  return `# OpenPress project setup

This directory was created by \`create-openpress\` ${info.version} from the OpenPress source tree (${info.sourceKind}).
It contains the NestJS API (\`apps/api\`) and the Next.js app (\`apps/web\`) so they can be installed and run with pnpm.
It is not a wrapper around an unpublished npm package.

\`npx create-openpress\` and \`npm create openpress\` are not published. The npm name is provisional.

## What this command already did

- Copied the API, web app, workspace packages, lockfile, and numbered SQL migrations.
- Left out \`node_modules\`, git history, \`.github\` workflows, uploaded plugins and themes, \`.env\` files from the source tree, and the \`create-openpress\` package itself.
- ${installStep.trim()}
- ${envStep.trim()}
- ${migrateStep.trim()}
- ${seedStep.trim()}

No npm or GitHub Packages publish was performed.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 or newer (\`corepack enable\`, then a checkout that pins \`packageManager\` in \`package.json\`)
- PostgreSQL 14 or newer

## Run it

\`\`\`bash
cd ${directory}
${info.skipInstall ? 'pnpm install --frozen-lockfile\n' : ''}# PostgreSQL. Docker is one option; an existing server or \`pnpm db:local\` is the other.
docker compose up -d
# Alternative, without Docker. Leave this process running:
# pnpm db:local

pnpm db:migrate
pnpm db:seed
pnpm dev
\`\`\`

| URL | What |
|---|---|
| http://localhost:3000 | Public site and admin |
| http://localhost:3000/admin | Admin |
| http://localhost:4000/api | REST API |
| http://localhost:4000/api/health | API health |

\`pnpm dev\` runs the API and web app together. Stop both with Ctrl+C.

## Build and start

\`\`\`bash
pnpm build
pnpm --filter @openpress/api start
pnpm --filter @openpress/web start
\`\`\`

Run migrations before starting a new deploy. \`pnpm db:migrate\` applies every numbered file in \`apps/api/db/migrations\`. It does not drop schemas or data.

The local seed creates \`admin@openpress.local\` / \`admin12345\`. That account is for a machine you control. Change the password before anyone else can reach the site.

## Docker alternative

\`docker-compose.yml\` in this directory starts PostgreSQL only, using the local development user and database. The API and web app still run with pnpm.

\`docker-compose.prod.yml\` builds the API and web images from this source tree. Change its JWT values before exposing it.

The \`create-openpress compose <version>\` command, run from a GitHub checkout of OpenPress, prints a different Compose file that references GHCR images. Those images exist only after a release workflow publishes them. This project command does not pull them.

## Flags used to create this directory

- install: ${info.skipInstall ? 'skipped' : 'pnpm install --frozen-lockfile'}
- env files: ${info.skipEnv ? 'skipped' : 'written'}
- migrate: ${info.migrate ? 'ran' : 'not run'}
- seed: ${info.seed ? 'ran' : 'not run'}

## Troubleshooting

| Problem | What to do |
|---|---|
| Directory is not empty | Pick a new path. The CLI does not replace existing files. |
| \`pnpm\` is missing | Install pnpm 10+ and rerun \`pnpm install --frozen-lockfile\` here. |
| Migration cannot connect | Start PostgreSQL first. Compare the host and database name with \`apps/api/.env\` without pasting that file into a ticket. |
| Port 5432, 3000, or 4000 is in use | Stop the other process or change the port in Compose and the matching env file. |
| Ctrl+C during copy | If this command created the directory, it removes that incomplete directory. |
| Ctrl+C during install | Project files stay. Run \`pnpm install --frozen-lockfile\` again. |
`;
}

export function helpText(version = readOwnVersion()) {
  return `create-openpress ${version}

Create a local OpenPress project from a GitHub checkout or from a tarball packed in that checkout.
This package is not published. npx create-openpress and npm create openpress do not work yet.
The npm package name is provisional and is not claimed to be available.

Usage
  create-openpress <directory> [options]
  create-openpress plugin <id> [directory]
  create-openpress compose [version]
  create-openpress --help
  create-openpress --version

Project options
  --yes, -y              Accept the defaults and do not prompt
  --non-interactive      Never prompt. A directory argument is required
  --skip-install         Do not run pnpm install
  --install              Run pnpm install --frozen-lockfile (default)
  --skip-env             Do not write apps/api/.env or apps/web/.env
  --database-url <url>   postgresql:// URL written to apps/api/.env and not printed
  --migrate              Run pnpm db:migrate after install. PostgreSQL must be up
  --seed                 Run pnpm db:seed after install

The project command copies this repository's API, web app, workspace packages,
lockfile, and SQL migrations into an empty directory. It refuses a path that
already contains files. It does not drop a database. Migrations and seed run
only when you pass --migrate or --seed.

With a terminal and without --yes, the CLI asks before installing, migrating,
or seeding. The default is to install, and not to migrate or seed.

Plugin
  create-openpress plugin <id> [directory]
  --force                Replace plugin.json or index.js if that file exists

compose
  Prints a Docker Compose file for ghcr.io images pinned to a version.
  It does not contact a registry and does not start containers.
  Example: create-openpress compose ${version}
`;
}

export function parseArgs(argv) {
  const positionals = [];
  const flags = {
    help: false,
    version: false,
    yes: false,
    nonInteractive: false,
    skipInstall: false,
    install: false,
    skipEnv: false,
    migrate: false,
    seed: false,
    force: false,
    databaseUrl: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('--database-url=')) {
      flags.databaseUrl = arg.slice('--database-url='.length);
      continue;
    }
    if (arg === '--database-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new CliError('Pass a postgresql:// URL after --database-url.');
      flags.databaseUrl = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      if (!Object.hasOwn(FLAG_MAP, arg)) {
        throw new CliError(`Unknown option ${arg}. Run create-openpress --help.`);
      }
      flags[FLAG_MAP[arg]] = true;
      continue;
    }
    positionals.push(arg);
  }
  if (flags.help) return { command: 'help', flags };
  if (flags.version) {
    if (positionals.length > 0) throw new CliError('Run create-openpress --version on its own.');
    return { command: 'version', flags };
  }
  if (flags.skipInstall && flags.install) {
    throw new CliError('Use either --skip-install or --install, not both.');
  }
  if (flags.databaseUrl !== undefined) flags.databaseUrl = parseDatabaseUrl(flags.databaseUrl);

  const [first, second, third, ...rest] = positionals;
  if (first === 'compose') {
    if (third !== undefined || rest.length > 0) throw new CliError('Usage: create-openpress compose [version]');
    if (flags.force || flags.migrate || flags.seed || flags.skipInstall || flags.skipEnv || flags.install) {
      throw new CliError('compose does not take project setup options.');
    }
    if (flags.databaseUrl !== undefined) throw new CliError('compose does not take --database-url.');
    return { command: 'compose', composeVersion: second, flags };
  }
  if (first === 'plugin') {
    if (!second || rest.length > 0) throw new CliError('Usage: create-openpress plugin <id> [directory]');
    if (flags.migrate || flags.seed || flags.skipInstall || flags.skipEnv || flags.install || flags.databaseUrl) {
      throw new CliError('plugin does not take project setup options.');
    }
    return { command: 'plugin', pluginId: second, directory: third, force: flags.force, flags };
  }
  if (third !== undefined || rest.length > 0 || second !== undefined) {
    throw new CliError('Pass one project directory. Example: create-openpress ./my-site --yes');
  }
  if (flags.force) {
    throw new CliError('The project command never overwrites files. --force applies only to create-openpress plugin.');
  }
  return {
    command: 'scaffold',
    directory: first,
    yes: flags.yes,
    nonInteractive: flags.nonInteractive,
    skipInstall: flags.skipInstall,
    installExplicit: flags.install,
    skipEnv: flags.skipEnv,
    databaseUrl: flags.databaseUrl,
    migrate: flags.migrate,
    seed: flags.seed,
    flags,
  };
}

export function defaultIo() {
  return {
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    stdout: (message) => process.stdout.write(message),
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    prompt: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return (await rl.question(question)).trim();
      } finally {
        rl.close();
      }
    },
  };
}

function isYes(value, fallback) {
  if (!value) return fallback;
  if (/^(y|yes)$/i.test(value)) return true;
  if (/^(n|no)$/i.test(value)) return false;
  throw new CliError('Answer y or n.');
}

export function formatPlan(plan) {
  return [
    `OpenPress ${plan.version}`,
    '',
    `Directory: ${plan.directory}`,
    'This command will:',
    '- Copy the NestJS API, Next.js app, workspace packages, lockfile, and SQL migrations',
    '- Skip node_modules, secrets, git history, and GitHub workflows',
    plan.skipEnv
      ? '- Leave environment files unwritten'
      : '- Write gitignored apps/api/.env and apps/web/.env. JWT secrets are generated and are not printed',
    plan.customDatabase
      ? '- Save the PostgreSQL URL you supplied. It is not printed'
      : '- Save the local development database setting from apps/api/.env.example. It is not printed',
    plan.skipInstall ? '- Skip pnpm install' : '- Run pnpm install --frozen-lockfile',
    plan.migrate ? '- Run pnpm db:migrate (no database drop)' : '- Not run migrations',
    plan.seed ? '- Run pnpm db:seed' : '- Not seed the database',
    '- Not publish any package',
    '',
  ].join('\n');
}

export async function resolveScaffoldPlan(args, io) {
  throwIfAborted(args.signal);
  const interactive = io.isTTY && !args.yes && !args.nonInteractive;
  let directory = args.directory;
  if (!directory && interactive) {
    directory = await io.prompt('Project directory (empty or new): ');
    throwIfAborted(args.signal);
  }
  if (!directory) {
    throw new CliError('A directory is required in non-interactive mode. Example: create-openpress ./my-site --yes');
  }

  let databaseUrl = args.databaseUrl;
  let customDatabase = databaseUrl !== undefined;
  if (!customDatabase && interactive) {
    const entered = await io.prompt(
      'PostgreSQL URL, or press Enter for the local development default. The value is not printed again: ',
    );
    if (entered) {
      databaseUrl = parseDatabaseUrl(entered);
      customDatabase = true;
    }
    throwIfAborted(args.signal);
  }
  if (!databaseUrl) databaseUrl = LOCAL_DATABASE_URL;

  let skipInstall = args.skipInstall;
  if (!args.skipInstall && !args.installExplicit && interactive) {
    const answer = await io.prompt('Run pnpm install --frozen-lockfile? (Y/n) ');
    skipInstall = !isYes(answer, true);
  }

  let migrate = args.migrate;
  if (!args.migrate && interactive) {
    const answer = await io.prompt('Run pnpm db:migrate after install? PostgreSQL must already be running (y/N) ');
    migrate = isYes(answer, false);
  }
  let seed = args.seed;
  if (!args.seed && interactive) {
    const answer = await io.prompt('Run pnpm db:seed after install? This inserts the local sample content (y/N) ');
    seed = isYes(answer, false);
  }
  if ((migrate || seed) && skipInstall) {
    throw new CliError(
      'Refusing to run database commands because dependencies would not be installed. Omit --skip-install, or install and run pnpm db:migrate yourself.',
    );
  }

  const source = findSourceRoot();
  const plan = {
    version: readOwnVersion(),
    directory: assertSafeDestination(directory, source.root),
    sourceRoot: source.root,
    sourceKind: source.kind,
    skipInstall,
    skipEnv: args.skipEnv,
    databaseUrl,
    customDatabase,
    migrate,
    seed,
    signal: args.signal,
    onFile: args.onFile,
  };
  io.log(formatPlan(plan));
  if (interactive) {
    const answer = await io.prompt('Continue? (Y/n) ');
    throwIfAborted(args.signal);
    if (!isYes(answer, true)) throw new CliError('Cancelled. No files were written.', { code: 'CANCELLED' });
  }
  return plan;
}

export function runCommand(command, args, { cwd, signal, secrets = [], io = defaultIo(), env = process.env } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };
    let child;
    try {
      const options = {
        cwd,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      };
      if (signal) options.signal = signal;
      child = spawn(command, args, options);
    } catch (error) {
      finish(rejectPromise, error);
      return;
    }
    const write = (chunk) => {
      io.stdout(redactSecrets(chunk.toString(), secrets));
    };
    child.stdout?.on('data', write);
    child.stderr?.on('data', write);
    child.on('error', (error) => {
      if (error?.code === 'ENOENT') {
        finish(
          rejectPromise,
          new CliError(`Could not run ${command}. Install it and try again, or pass --skip-install for a files-only project.`),
        );
        return;
      }
      if (error?.name === 'AbortError' || signal?.aborted) {
        finish(rejectPromise, new CliError('Cancelled.', { code: 'CANCELLED' }));
        return;
      }
      finish(rejectPromise, error);
    });
    child.on('close', (code) => {
      if (signal?.aborted) {
        finish(rejectPromise, new CliError('Cancelled.', { code: 'CANCELLED' }));
        return;
      }
      if (code === 0) finish(resolvePromise, undefined);
      else finish(rejectPromise, new CliError(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

async function captureCommand(command, args) {
  let stdout = '';
  const io = { stdout: (chunk) => { stdout += chunk; }, log() {}, error() {} };
  await runCommand(command, args, { io, secrets: [] });
  return stdout;
}

export async function assertPnpmInstalled() {
  let output;
  try {
    output = await captureCommand('pnpm', ['--version']);
  } catch (error) {
    if (error instanceof CliError && /Could not run pnpm/.test(error.message)) {
      throw new CliError('pnpm is not installed. Install pnpm 10 or newer, or pass --skip-install.');
    }
    throw error;
  }
  return assertPnpmVersion(parsePnpmVersion(output));
}

function prependReadme(dest, version) {
  const path = join(dest, 'README.md');
  if (!existsSync(path)) return;
  const marker = '<!-- create-openpress-scaffold -->';
  const current = readFileSync(path, 'utf8');
  if (current.includes(marker)) return;
  const banner = `${marker}\n\nThis folder was created by create-openpress ${version} from the OpenPress source tree. Setup steps for this copy are in [SETUP.md](SETUP.md). \`npx create-openpress\` is not published.\n\n`;
  writeFileSync(path, banner + current);
}

export async function scaffoldProject(plan, io = defaultIo()) {
  assertNodeVersion();
  if (!plan.skipInstall || plan.migrate || plan.seed) await assertPnpmInstalled();
  const secrets = [plan.databaseUrl].filter(Boolean);
  let ownDirectory = false;
  const destExisted = existsSync(plan.directory);
  try {
    throwIfAborted(plan.signal);
    if (!destExisted) mkdirSync(plan.directory);
    ownDirectory = true;
    io.log('Copying the OpenPress API, web app, and workspace files...');
    const copied = copyTree(plan.sourceRoot, plan.directory, { signal: plan.signal, onFile: plan.onFile });
    const packagePath = join(plan.directory, 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    writeFileSync(packagePath, `${JSON.stringify(patchRootPackageJson(pkg), null, 2)}\n`);

    let jwtSecret;
    let jwtRefreshSecret;
    if (!plan.skipEnv) {
      const examplePath = join(plan.directory, 'apps/api/.env.example');
      if (!existsSync(examplePath)) throw new CliError('The source tree is missing apps/api/.env.example.');
      jwtSecret = randomBytes(32).toString('hex');
      jwtRefreshSecret = randomBytes(32).toString('hex');
      secrets.push(jwtSecret, jwtRefreshSecret);
      const envPath = join(plan.directory, 'apps/api/.env');
      writeFileSync(
        envPath,
        renderApiEnv(readFileSync(examplePath, 'utf8'), {
          databaseUrl: plan.databaseUrl,
          jwtSecret,
          jwtRefreshSecret,
        }),
        { mode: 0o600 },
      );
      const webExample = join(plan.directory, 'apps/web/.env.example');
      if (!existsSync(webExample)) throw new CliError('The source tree is missing apps/web/.env.example.');
      copyFileSync(webExample, join(plan.directory, 'apps/web/.env'));
    }

    writeFileSync(
      join(plan.directory, 'SETUP.md'),
      renderSetup({
        version: plan.version,
        directory: plan.directory,
        sourceKind: plan.sourceKind,
        skipInstall: plan.skipInstall,
        skipEnv: plan.skipEnv,
        customDatabase: plan.customDatabase,
        migrate: plan.migrate,
        seed: plan.seed,
      }),
    );
    prependReadme(plan.directory, plan.version);
    ownDirectory = false;
    io.log(`Copied ${copied} files to ${plan.directory}.`);

    if (!plan.skipInstall) {
      io.log('Installing dependencies with pnpm install --frozen-lockfile.');
      try {
        await runCommand('pnpm', ['install', '--frozen-lockfile'], {
          cwd: plan.directory,
          signal: plan.signal,
          secrets,
          io,
        });
      } catch (error) {
        if (error?.code === 'CANCELLED') throw error;
        throw new CliError(
          `Dependency install failed. Project files are in ${plan.directory}. Run pnpm install --frozen-lockfile there after fixing the error. Nothing was published. ${error instanceof Error ? error.message : ''}`.trim(),
        );
      }
    }

    if (plan.migrate) {
      io.log('Running pnpm db:migrate. This applies pending SQL files and does not drop the database.');
      try {
        await runCommand('pnpm', ['db:migrate'], { cwd: plan.directory, signal: plan.signal, secrets, io });
      } catch (error) {
        if (error?.code === 'CANCELLED') throw error;
        throw new CliError(
          `pnpm db:migrate failed. The database was not dropped. Project files are in ${plan.directory}. Start PostgreSQL and check apps/api/.env without sending that file to anyone. ${error instanceof Error ? error.message : ''}`.trim(),
        );
      }
    }
    if (plan.seed) {
      io.log('Running pnpm db:seed.');
      try {
        await runCommand('pnpm', ['db:seed'], { cwd: plan.directory, signal: plan.signal, secrets, io });
      } catch (error) {
        if (error?.code === 'CANCELLED') throw error;
        throw new CliError(
          `pnpm db:seed failed. Project files are in ${plan.directory}. Migrate the database before seeding. ${error instanceof Error ? error.message : ''}`.trim(),
        );
      }
    }

    io.log('');
    io.log('Project ready. Nothing was published to a registry.');
    io.log(`Next: cd ${shellQuote(plan.directory)}`);
    if (plan.skipInstall) io.log('Then install: pnpm install --frozen-lockfile');
    if (!plan.migrate || !plan.seed) {
      io.log('Start PostgreSQL with docker compose up -d, or run pnpm db:local and leave it running.');
    }
    if (!plan.migrate) io.log('Then: pnpm db:migrate');
    if (!plan.seed) io.log('Then: pnpm db:seed');
    io.log('Then: pnpm dev');
    io.log('Web http://localhost:3000  API http://localhost:4000/api');
    io.log('Details are in SETUP.md. Database URLs and JWT secrets were not printed.');
    return { directory: plan.directory, copied };
  } catch (error) {
    const cancelled = plan.signal?.aborted || error?.code === 'CANCELLED';
    if (ownDirectory) rmSync(plan.directory, { recursive: true, force: true });
    if (cancelled) {
      throw new CliError(
        ownDirectory
          ? 'Cancelled. Removed the incomplete project directory.'
          : `Cancelled. Left ${plan.directory} in place. Install or database steps may be incomplete.`,
        { code: 'CANCELLED' },
      );
    }
    throw error;
  }
}

export async function main(argv = process.argv.slice(2), io = defaultIo(), extras = {}) {
  assertNodeVersion();
  const args = parseArgs(argv);
  if (args.command === 'help') {
    io.log(helpText());
    return;
  }
  if (args.command === 'version') {
    io.log(readOwnVersion());
    return;
  }
  if (args.command === 'compose') {
    io.stdout(renderCompose(args.composeVersion || readOwnVersion()));
    return;
  }
  if (args.command === 'plugin') {
    const dir = resolve(args.directory || args.pluginId);
    scaffoldPlugin(args.pluginId, dir, args.force);
    io.log(`Plugin scaffold written to ${dir}`);
    return;
  }
  const plan = await resolveScaffoldPlan(
    { ...args, signal: extras.signal, onFile: extras.onFile },
    io,
  );
  await scaffoldProject(plan, io);
}
