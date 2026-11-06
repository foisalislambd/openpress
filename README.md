# OpenPress

**WordPress-shaped publishing, on a TypeScript monorepo you can actually extend.**

[![Full tour: admin to published site in ~50s — click for the video](docs/media/walkthrough.gif)](docs/media/walkthrough.mp4)

*Full tour: admin to published site in ~50s — click for the video.*

[![Release](https://img.shields.io/github/v/release/foisalislambd/openpress?display_name=tag)](https://github.com/foisalislambd/openpress/releases)
[![GHCR](https://img.shields.io/badge/ghcr.io-openpress-2496ED)](https://github.com/foisalislambd/openpress/pkgs/container/openpress-api)
[![npm](https://img.shields.io/npm/v/@openpress/plugin-sdk)](https://www.npmjs.com/package/@openpress/plugin-sdk)
[![Version check](https://img.shields.io/github/actions/workflow/status/foisalislambd/openpress/version-check.yml?label=version)](https://github.com/foisalislambd/openpress/actions/workflows/version-check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A self-hosted CMS for posts, pages, media, themes, plugins, and roles, without a PHP runtime. The admin follows WordPress. The code is NestJS, Next.js, and PostgreSQL. Version `0.3.0` in [`VERSION.md`](VERSION.md) is what gets tagged, imaged, and published.

## See it in action

No install required. The clips below are from a local site with seeded posts, the customizer, and a plugin that waits on another.

| | |
|---|---|
| Write and publish | Switch a theme |
| ![Writing in the block editor](docs/media/editor.gif) | ![Themes and the customizer](docs/media/themes.gif) |
| Review a plugin, then install | Import WordPress |
| ![Installed plugins and a dependency](docs/media/plugins.gif) | ![WordPress WXR import](docs/media/import.gif) |

The full pass (dashboard, editor, media, themes, plugins, menus, network, comments, scheduled events, import, public site) is [docs/media/walkthrough.mp4](docs/media/walkthrough.mp4), about 50 seconds.

Still images of the same screens are in [docs/screenshots](docs/screenshots).

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

Images and npm packages appear after this version is merged to `main` and the Release workflow finishes. Until then, use the source setup below.

### Docker, from the published images

```bash
npx create-openpress@latest my-site
cd my-site
# Replace both JWT secrets in docker-compose.yml
docker compose up -d
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed
```

That Compose file pins `ghcr.io/foisalislambd/openpress-api` and `ghcr.io/foisalislambd/openpress-web` to the CLI version. Open http://localhost:3000.

```bash
docker pull ghcr.io/foisalislambd/openpress-api:0.3.0
docker pull ghcr.io/foisalislambd/openpress-web:0.3.0
```

`latest`, `0.3`, and `0` move only on a stable release. A prerelease is tagged with its full version only.

To build the images yourself from this repository:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Change the JWT secrets in that file before you expose it. The first GHCR push may leave the packages private. Set them to public on the package page if `docker pull` should work without a login. Details are in [docs/releasing.md](docs/releasing.md).

### npm

```bash
npm install -D @openpress/plugin-sdk @openpress/theme-sdk
npx create-openpress plugin hello-note
```

`@openpress/plugin-sdk` types `plugin.json` and `activate(ctx)`. `@openpress/theme-sdk` types `theme.json`. Prereleases use the `next` dist-tag. The API and the Next.js app are not published as installable apps. They ship as the container images above.

### From source

**Requirements:** Node.js 20+, pnpm 10+, and PostgreSQL 14+.

```bash
git clone https://github.com/foisalislambd/openpress.git
cd openpress
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Start Postgres. Both options use `postgresql://openpress:openpress@localhost:5432/openpress`.

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

Seeded login, for local development only:

- Email: `admin@openpress.local`
- Password: `admin12345`

Change that password before any shared deploy. `pnpm db:migrate` applies `001_init.sql`, `002_core_parity.sql`, and `003_platform.sql`.

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

`VERSION.md` is one version number. `pnpm release:bump patch|minor|major` advances it. Merging a higher version to `main` tags `vX.Y.Z`, opens a GitHub Release whose notes are the generated changelog, pushes the images, and publishes the npm packages. The same or a lower version does nothing. See [docs/releasing.md](docs/releasing.md).

## Documentation

| Guide | Description |
|---|---|
| [Docs index](docs/README.md) | All guides |
| [Releasing](docs/releasing.md) | Version file, images, npm, secrets |
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
