# create-openpress

Scaffold a local OpenPress project that contains the NestJS API (`apps/api`) and the Next.js app (`apps/web`).

The package is **private and is not published**. Merging the OpenPress repository does not upload it to npm, GitHub Packages, or any other registry. The name `create-openpress` is provisional. This repo does not claim that name is free on npm.

## Available now

Run it from a GitHub checkout of [openpress](https://github.com/foisalislambd/openpress):

```bash
git clone https://github.com/foisalislambd/openpress.git
cd openpress
pnpm install
node packages/create-openpress/bin/create-openpress.mjs --help
node packages/create-openpress/bin/create-openpress.mjs --version
node packages/create-openpress/bin/create-openpress.mjs ../my-site --yes
```

Or pack a tarball in that checkout and run the packed CLI. This still does not publish:

```bash
pnpm --filter create-openpress pack --pack-destination /tmp/openpress-cli
tar -xzf /tmp/openpress-cli/create-openpress-1.0.7.tgz -C /tmp/openpress-cli
node /tmp/openpress-cli/package/bin/create-openpress.mjs "/tmp/my site" --yes --skip-install
```

The tarball filename uses the version in this `package.json`, which follows the repository `VERSION.md`.

## Not available yet

Do not run these. They need a registry release that this repository does not perform:

```bash
npx create-openpress@latest my-site
npm create openpress@latest my-site
```

Publishing later is a separate change: confirm the npm name, remove `"private": true` from this `package.json`, and add the package back to the Release workflow's publish list on purpose. Until then the workflow refuses this package name and any private package.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 or newer when the command installs dependencies or runs database scripts
- PostgreSQL 14 or newer before `pnpm db:migrate`

Docker is optional. The generated `docker-compose.yml` starts PostgreSQL only. `pnpm db:local` starts an embedded PostgreSQL server when Docker is not installed. Leave that process running.

## What the project command does

`create-openpress <directory>` copies the current API, web app, workspace packages, pnpm lockfile, and numbered SQL migrations into an empty directory.

It always tells you the steps before it writes, and again when it finishes. By default it:

- refuses a path that already contains any file, including with `--force` (that flag is only for `plugin`)
- refuses a destination inside the OpenPress checkout
- skips `node_modules`, `.git`, `.github`, build output, uploaded plugins and themes, and every `.env` file in the source tree
- writes `apps/api/.env` (mode `0600`) and `apps/web/.env`, both covered by `.gitignore`
- generates JWT secrets locally and does not print them or the database URL
- runs `pnpm install --frozen-lockfile`
- does **not** migrate, seed, drop, or reset a database

Pass `--migrate` or `--seed` to run those existing scripts after install. They are never the default. `--migrate` applies pending SQL files and does not drop schemas.

On Ctrl+C while files are still being copied, a directory this command created is removed. On Ctrl+C or a failure during install, the copied project is left in place so you can retry. A failed migration does not drop the database.

## Flags

| Flag | Effect |
|---|---|
| `--yes`, `-y` | Accept defaults and do not prompt |
| `--non-interactive` | Never prompt. A directory is required. Same defaults as `--yes` |
| `--skip-install` | Copy files only. Do not run pnpm |
| `--install` | Run `pnpm install --frozen-lockfile` (this is the default) |
| `--skip-env` | Do not write `.env` files |
| `--database-url <url>` | `postgresql://` or `postgres://` URL saved to `apps/api/.env` and not printed |
| `--migrate` | Run `pnpm db:migrate` after a successful install |
| `--seed` | Run `pnpm db:seed` after a successful install |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Print the CLI version |

`--skip-install` together with `--migrate` or `--seed` is refused, because those scripts need installed dependencies. Run them yourself after `pnpm install`.

In a terminal, without `--yes`, the CLI asks for the directory, an optional database URL, whether to install, and whether to migrate or seed. Install defaults to yes. Migrate and seed default to no.

## Generated project

The new directory is a pnpm workspace, not a wrapper that depends on an unpublished package. `SETUP.md` in that directory records what this command already did. From there:

```bash
cd ../my-site
pnpm install --frozen-lockfile   # omit when the CLI already installed
docker compose up -d             # PostgreSQL, when Docker is installed
# or: pnpm db:local              # embedded PostgreSQL; leave it running
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| URL | What |
|---|---|
| http://localhost:3000 | Site and admin |
| http://localhost:3000/admin | Admin |
| http://localhost:4000/api | REST API |
| http://localhost:4000/api/health | API health |

Build and start:

```bash
pnpm build
pnpm --filter @openpress/api start
pnpm --filter @openpress/web start
```

`pnpm db:migrate` applies `apps/api/db/migrations/*.sql` in order. The local seed creates `admin@openpress.local` / `admin12345`. Change that password before anyone else can reach the site.

`docker-compose.prod.yml` in the generated project builds API and web images from that source. Change its JWT values before exposing it.

The copy omits `.github` workflows, so pushing the generated project somewhere does not run OpenPress's Release workflow.

## Other commands

```bash
node packages/create-openpress/bin/create-openpress.mjs plugin hello-note
node packages/create-openpress/bin/create-openpress.mjs plugin hello-note ./hello-note --force
node packages/create-openpress/bin/create-openpress.mjs compose 1.0.7 > /tmp/docker-compose.ghcr.yml
```

`plugin` writes `plugin.json` and `index.js`. `--force` may replace those two files. It does not apply to a project directory.

`compose` prints a Compose file that pins `ghcr.io/foisalislambd/openpress-api` and `ghcr.io/foisalislambd/openpress-web` to the version you pass. The version must be strict semver. The command does not contact a registry, start containers, or pull images. Those images exist only after the Release workflow publishes them.

## Troubleshooting

| Problem | What to do |
|---|---|
| `not empty` | Choose a new directory. Existing files are left untouched. |
| `inside the OpenPress source tree` | Use a path outside the checkout, for example `../my-site`. |
| `parent directory does not exist` | Create the parent first. The CLI creates only the project directory. |
| `Node.js 20 or newer` | Upgrade Node, then rerun the same command. |
| `pnpm is not installed` or `pnpm 10` | Install pnpm 10+ (`corepack enable`) or pass `--skip-install` and install later. |
| Install failed | The project files remain. Run `pnpm install --frozen-lockfile` in that directory. |
| `pnpm db:migrate` failed | Start PostgreSQL first. The CLI does not drop the database. Do not paste `apps/api/.env` into a ticket. |
| Port 5432, 3000, or 4000 is in use | Stop the other process, or change the port in Compose and the matching env file together. |
| A path containing spaces | Pass it as one argument. The CLI does not run the path in a shell. |
| `npx create-openpress` fails | Expected. Use the checkout or tarball commands above. |

## Tests

From the repository root:

```bash
pnpm --filter create-openpress build
pnpm --filter create-openpress test
```

`pnpm test:release` runs those CLI tests and the version-file tests. The `create-openpress` GitHub Actions workflow runs the same checks with `contents: read` and does not publish.
