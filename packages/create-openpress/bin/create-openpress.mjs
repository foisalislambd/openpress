#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ownVersion = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')).version;

export function renderCompose(version) {
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
    throw new Error('Plugin id must be lowercase and start with a letter or number.');
  }
  const title = id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    'plugin.json': `${JSON.stringify(
      {
        id,
        name: title,
        version: '1.0.0',
        description: `${title} plugin`,
        main: 'index.js',
        requires: { openpress: `>=${ownVersion}` },
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

function writeNew(dir, files, force) {
  mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    if (existsSync(path) && !force) {
      throw new Error(`${path} already exists. Pass --force to replace it.`);
    }
    writeFileSync(path, contents);
  }
}

export function scaffoldSite(dir, version = ownVersion, force = false) {
  writeNew(
    dir,
    {
      'docker-compose.yml': renderCompose(version),
      '.env.example': `JWT_SECRET=change-me\nJWT_REFRESH_SECRET=change-me-too\n`,
      'README.md': `# OpenPress ${version}\n\n1. Replace both JWT secrets in docker-compose.yml.\n2. \`docker compose up -d\`\n3. \`docker compose exec api pnpm db:migrate\`\n4. \`docker compose exec api pnpm db:seed\`\n5. Open http://localhost:3000/admin/login (seeded admin is admin@openpress.local / admin12345 until you change it).\n\nImages: \`ghcr.io/foisalislambd/openpress-api:${version}\` and \`ghcr.io/foisalislambd/openpress-web:${version}\`.\n`,
    },
    force,
  );
}

export function scaffoldPlugin(id, dir, force = false) {
  writeNew(dir, pluginFiles(id), force);
}

function help() {
  console.log(`create-openpress ${ownVersion}

  create-openpress [directory]           Write a Docker Compose file that pulls OpenPress ${ownVersion}
  create-openpress plugin <id> [directory]
                                         Scaffold plugin.json and index.js
  create-openpress compose [version]     Print a Compose file to stdout

Pass --force to replace files that already exist.
`);
}

export function main(argv = process.argv.slice(2)) {
  const force = argv.includes('--force');
  const args = argv.filter((arg) => arg !== '--force');
  if (args[0] === '--help' || args[0] === '-h') {
    help();
    return;
  }
  if (args[0] === 'compose') {
    process.stdout.write(renderCompose(args[1] || ownVersion));
    return;
  }
  if (args[0] === 'plugin') {
    const id = args[1];
    if (!id) throw new Error('Usage: create-openpress plugin <id> [directory]');
    const dir = resolve(args[2] || id);
    scaffoldPlugin(id, dir, force);
    console.log(`Plugin scaffold written to ${dir}`);
    return;
  }
  const dir = resolve(args[0] || '.');
  scaffoldSite(dir, ownVersion, force);
  console.log(`OpenPress ${ownVersion} site files written to ${dir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
