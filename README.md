# <img src="docs/brand/openpress-icon-64.png" alt="" width="28" height="28" /> OpenPress

**WordPress-shaped publishing, on a TypeScript monorepo you can actually extend.**

[![Full tour: admin to published site in ~44s — click for the video](docs/media/walkthrough.gif)](docs/media/walkthrough.mp4)

*Full tour: admin to published site in ~44s — click for the video.*

[![Release](https://img.shields.io/github/v/release/foisalislambd/openpress?display_name=tag)](https://github.com/foisalislambd/openpress/releases)
[![GHCR](https://img.shields.io/badge/ghcr.io-openpress-2496ED)](https://github.com/foisalislambd/openpress/pkgs/container/openpress-api)
[![npm](https://img.shields.io/npm/v/@openpress/plugin-sdk)](https://www.npmjs.com/package/@openpress/plugin-sdk)
[![Version check](https://img.shields.io/github/actions/workflow/status/foisalislambd/openpress/version-check.yml?label=version)](https://github.com/foisalislambd/openpress/actions/workflows/version-check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A self-hosted CMS for posts, pages, media, themes, plugins, and roles, without a PHP runtime. The admin follows WordPress. The code is NestJS, Next.js, and PostgreSQL. The version in [`VERSION.md`](VERSION.md) is what gets tagged and imaged. `@openpress/plugin-sdk` and `@openpress/theme-sdk` follow that version. `create-openpress` follows it too, and stays in this repository until a later, explicit publish.

## See it in action

No install required. The clips below are from a local site with seeded posts, the customizer, and a plugin that waits on another.

| | |
|---|---|
| Write and publish | Switch a theme |
| ![Writing in the block editor](docs/media/editor.gif) | ![Themes and the customizer](docs/media/themes.gif) |
| Review a plugin, then install | Import WordPress |
| ![Installed plugins and a dependency](docs/media/plugins.gif) | ![WordPress WXR import](docs/media/import.gif) |

The full pass (dashboard, posts list, block editor, media, themes, plugins, menus, categories, tools, import, and the public site) is [docs/media/walkthrough.mp4](docs/media/walkthrough.mp4), about 44 seconds. The public clip shows the site date and the privacy-policy link.

Still images of the same screens are in [docs/screenshots](docs/screenshots), including the [posts list](docs/screenshots/posts-list.webp), [category edit](docs/screenshots/categories.webp), [tools](docs/screenshots/tools.webp), and [discussion settings](docs/screenshots/discussion.webp).

## Why OpenPress

| | WordPress | EmDash | OpenPress |
|---|---|---|---|
| Stack | PHP and MySQL | TypeScript, its own runtime | TypeScript, NestJS, Next.js, PostgreSQL |
| Plugins | `add_action` / `add_filter` in the same process | Sandboxed workers and a capability file | The same hook names, in a separate process, with the manifest checked again on every host call |
| Moving a site | Native | Private and scheduled posts become drafts | WXR import keeps private, password, and scheduled posts |
| Packages | The plugin directory | A signed registry | Signed zips, a permission review, and rollback. The public directory is later |

OpenPress fits a team that already works in React and Node and wants WordPress habits. It is the wrong fit when you need the WordPress plugin directory, Gutenberg block plugins, or multisite today. Those are on the [roadmap](docs/wordpress-parity-roadmap.md).

## Features

**Content.** Posts and pages, custom post types and taxonomies, field groups, reusable patterns, a block editor, revisions with a side-by-side diff, autosave that does not create a revision, drafts, pending review, scheduling, trash, public / private / password visibility, sticky posts, excerpts, categories, tags, custom fields, and per-post translations.

**Media.** Uploads with an allow-list, alt text, captions, dimensions, focal point, rotate / flip / resize, thumbnail / medium / large sizes, WebP and AVIF derivatives, and srcset in the default theme. Local disk is the default. Set `STORAGE_DRIVER=s3` for S3-compatible storage.

**People.** Admin, Editor, Author, Contributor, and Subscriber. JWT access and refresh tokens, application passwords, authenticator-app 2FA, passkeys, a session list, and Google or GitHub sign-in when those client ids are set.

**Appearance.** A built-in React theme with a template hierarchy (`single-post`, `archive-category`, and the rest), uploaded token themes and React themes, theme mods and additional CSS, primary and footer menus, sidebar and footer widgets, and pretty permalinks from the permalink structure setting.

**SEO and headless.** Open Graph, Twitter cards, JSON-LD, canonical and hreflang tags, and robots controls. `/wp-json/wp/v2` covers posts, pages, media, categories, and tags, including `_embed`. GraphQL is at `POST /api/graphql`.

**Plugins.** Each plugin runs in its own process. Actions and filters stay WordPress-shaped. Content, storage, email, and HTTP are separate permissions. HTTP is limited to an allow list. Admins review that list before install. Packages can be signed, and a bad release can be rolled back.

**Import.** RSS, a sitemap, public search, an EmDash JSON import, and a WordPress WXR import that keeps private and scheduled posts, comment threads, downloads public attachments, and shows progress.

**Operations.** `GET /api/health`, a login audit log, scoped `opk_` API keys, signed webhooks, and a Redis worker for imports and image derivatives when `REDIS_URL` is set. Without Redis those jobs run in the API process. Production Compose is in `docker-compose.prod.yml`. With `DEMO_MODE=true`, an admin can `POST /api/platform/demo/reset`.

## Install

**Requirements:** Node.js 20 or newer, pnpm 10 or newer, and PostgreSQL 14 or newer.

Two ways to get the API and web app onto a machine are available from GitHub today. Neither one downloads `create-openpress` from npm.

### From a GitHub checkout

```bash
git clone https://github.com/foisalislambd/openpress.git
cd openpress
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` before a shared deploy. The example database URL matches `docker-compose.yml` and `pnpm db:local`.

```bash
docker compose up -d
# or, without Docker, leave this process running:
pnpm db:local
```

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| URL | What |
|---|---|
| http://localhost:3000 | Public site |
| http://localhost:3000/admin | Admin |
| http://localhost:4000/api | REST API |
| http://localhost:4000/api/health | API health |

`pnpm dev` runs the NestJS API and the Next.js app together. Stop both with Ctrl+C.

`pnpm db:migrate` applies every numbered SQL file in `apps/api/db/migrations`. It does not drop the database. Seeded login, for local development only:

- Email: `admin@openpress.local`
- Password: `admin12345`

Change that password before any shared deploy.

Build, then start each service:

```bash
pnpm build
pnpm --filter @openpress/api start
pnpm --filter @openpress/web start
```

`docker compose up -d` starts PostgreSQL only. `docker-compose.prod.yml` is the self-hosted option that builds the API and web images from this source. Change the JWT values in that file before exposing it. Details are in [docs/installation.md](docs/installation.md) and [docs/deployment.md](docs/deployment.md).

### create-openpress from this checkout

This is available now. It copies this repository's API, web app, workspace packages, lockfile, and migrations into an empty directory. It does not publish a package.

```bash
node packages/create-openpress/bin/create-openpress.mjs --help
node packages/create-openpress/bin/create-openpress.mjs --version
node packages/create-openpress/bin/create-openpress.mjs ../my-site --yes
```

`--yes` accepts the defaults: write gitignored env files with generated JWT secrets, run `pnpm install --frozen-lockfile`, and do not migrate or seed. Pass `--skip-install` to copy files only. Pass `--migrate` or `--seed` only when PostgreSQL is already running. The command refuses a directory that already has files.

A packed tarball, still without a registry, is:

```bash
pnpm --filter create-openpress pack --pack-destination /tmp/openpress-cli
tar -xzf /tmp/openpress-cli/create-openpress-1.0.7.tgz -C /tmp/openpress-cli
node /tmp/openpress-cli/package/bin/create-openpress.mjs "/tmp/my site" --yes --skip-install
```

The tarball name uses the version in `packages/create-openpress/package.json`. After either command, follow `SETUP.md` in the new directory. The next steps are the same as the checkout above: PostgreSQL, `pnpm db:migrate`, `pnpm db:seed`, and `pnpm dev`.

Plugin files, from the same CLI:

```bash
node packages/create-openpress/bin/create-openpress.mjs plugin hello-note
```

Flags, errors, and troubleshooting are in [packages/create-openpress/README.md](packages/create-openpress/README.md).

### Not published

These commands are the intended future interface. They are **not published**, and merging this repository does not publish them. The npm name `create-openpress` is provisional and is not claimed to be available.

```bash
npx create-openpress@latest my-site
npm create openpress@latest my-site
```

`create-openpress compose <version>`, from a checkout, only prints a Compose file that pins `ghcr.io/foisalislambd/openpress-api` and `ghcr.io/foisalislambd/openpress-web`. It does not pull images. Image tags and the SDK packages are described in [docs/releasing.md](docs/releasing.md).

## Plugins, in short

A plugin zip has `plugin.json` and a main file that exports `activate(ctx)`. Hooks are always available. Everything else is a permission. The plugin process cannot read the filesystem outside its directory, and `fetch` is sealed. See [docs/plugins.md](docs/plugins.md).

```json
{
  "id": "hello-note",
  "name": "Hello Note",
  "version": "1.0.0",
  "main": "index.js",
  "requires": { "openpress": ">=0.3.0" },
  "permissions": ["shortcodes"]
}
```

WordPress export files go to **Tools → Import**. Private, password, and scheduled posts stay that way. Uploading the same file again updates the existing posts.

## Releasing

`VERSION.md` is one version number. `pnpm release:bump patch|minor|major` advances it. Merging a higher version to `main` tags `vX.Y.Z`, opens a GitHub Release whose notes are the generated changelog, pushes the images, and publishes `@openpress/plugin-sdk` and `@openpress/theme-sdk`. `create-openpress` is versioned with that file and is not published. The same or a lower version does nothing. See [docs/releasing.md](docs/releasing.md).

## Documentation

| Guide | Description |
|---|---|
| [Docs index](docs/README.md) | All guides |
| [Releasing](docs/releasing.md) | Version file, images, npm SDKs, source-only CLI |
| [Installation](docs/installation.md) | Env vars and database options |
| [Themes](docs/themes.md) | `runtime-v1` and `react-v1` |
| [Plugins](docs/plugins.md) | Manifest, permissions, actions, filters |
| [API](docs/api.md) | REST endpoints |
| [WordPress parity roadmap](docs/wordpress-parity-roadmap.md) | What is done, and what is next |
| [Deployment](docs/deployment.md) | Production checklist |

## Contributing

Branch from `main`. Keep the admin familiar to WordPress users and the code a typed monorepo. `pnpm test` covers the API and the version file. `pnpm lint` checks the web app. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Copyright (c) OpenPress contributors.
