# OpenPress

**WordPress-shaped publishing, on a TypeScript monorepo you can actually extend.**

OpenPress is a self-hosted CMS for people who want posts, pages, media, themes, plugins, and roles without a PHP runtime. The admin follows WordPress concepts. The code is NestJS, Next.js, and PostgreSQL.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A site owner gets a public theme and an `/admin` panel. A developer gets typed hooks, a plugin manifest, and a REST API. A team moving off WordPress can import a WXR file today and follow the [parity roadmap](docs/wordpress-parity-roadmap.md) for what is still ahead, including a one-click migration.

## Why OpenPress instead of WordPress

| | WordPress | OpenPress |
|---|---|---|
| Stack | PHP and MySQL | TypeScript, NestJS, Next.js, PostgreSQL |
| Themes | PHP templates | React layouts, or design tokens |
| Plugins | `add_action` / `add_filter` in PHP, full process access | The same idea: `addAction` / `addFilter`, plus a `plugin.json` permission list and a core version range |
| Admin | wp-admin | The same jobs: dashboard, editor, media, comments, appearance, plugins, users, tools, settings |
| Data | Your server | Your server. MIT licensed. |

OpenPress is the right fit when the team already works in React and Node and wants WordPress habits (drafts, roles, menus, widgets, hooks) without adopting PHP. It is the wrong fit when you need the WordPress plugin directory, Gutenberg block plugins, or multisite today. Those are called out on the roadmap, not implied by the admin chrome.

## Features

**Content.** Posts and pages, block editor (BlockNote JSON), revisions, autosave that does not create a revision, drafts, scheduled publishing, trash, public / private / password visibility, sticky posts, excerpts, SEO fields, categories, tags, and custom fields.

**Media.** Uploads with an allow-list, alt text, captions, width and height, thumbnail / medium / large derivatives, and a numeric crop.

**Discussion.** Comments with moderation, open or closed per post, and a public comment form.

**People.** Admin, Editor, Author, Contributor, and Subscriber, with an explicit capability map. JWT access and refresh tokens. Application passwords for scripts (HTTP Basic). Registration stays off until an admin enables it.

**Appearance.** Default React theme, uploaded token themes and React themes, primary and footer menu locations, sidebar and footer widget areas.

**Plugins.** Each plugin runs in its own process. Actions and filters stay WordPress-shaped. Content, storage, email, and HTTP are separate permissions, and HTTP is limited to an allow list. Admins review those permissions before install. Packages can be signed, and a bad release can be rolled back. See [docs/plugins.md](docs/plugins.md).

**Feeds and tools.** RSS at `/feed`, a sitemap at `/sitemap.xml`, public search, and a WordPress WXR import that keeps private and scheduled posts, downloads public attachments, and shows progress. Permalink redirects from the import are honored by the public site.

**Operations.** `GET /api/health`, a login audit log, and [docker-compose.prod.yml](docker-compose.prod.yml) for Postgres, the API, and the web app. Apply `003_platform.sql` with `pnpm db:migrate`.

## Screenshots

Captured from a local run with demo posts, the default theme, and a plugin that declares its permissions.

| | |
|---|---|
| Dashboard | Post editor |
| ![Admin dashboard with At a Glance, activity, and quick draft](docs/screenshots/admin-dashboard.webp) | ![Post editor with visibility, schedule, and block content](docs/screenshots/post-editor.webp) |
| Media library | Plugins |
| ![Media library with generated sizes and attachment details](docs/screenshots/media-library.webp) | ![Plugins list showing permissions and the required OpenPress version](docs/screenshots/plugins.webp) |
| Themes | Menus |
| ![Themes screen with the default theme active](docs/screenshots/themes.webp) | ![Menus with primary and footer locations](docs/screenshots/menus.webp) |
| Widgets | Settings |
| ![Widgets screen with a sidebar text widget](docs/screenshots/widgets.webp) | ![General settings](docs/screenshots/settings.webp) |
| Homepage | Single post |
| ![Public homepage with the default theme](docs/screenshots/homepage.webp) | ![Single post with a cover, menu, and sidebar widget](docs/screenshots/single-post.webp) |
| Permission review | Rollback |
| ![Plugin upload stops on a permission review before install](docs/screenshots/plugin-review.webp) | ![Installed plugins run in a sandbox and can roll back](docs/screenshots/plugin-rollback.webp) |
| WordPress import | Site Health |
| ![WXR import finished and kept private, scheduled, and password posts](docs/screenshots/wxr-import.webp) | ![Site Health shows the session, settings, and database](docs/screenshots/site-health.webp) |

## Quick start

**Requirements:** Node.js 20+, pnpm 10+, and PostgreSQL 14+ (Docker or the embedded dev server).

```bash
git clone https://github.com/foisalislambd/openpress.git
cd openpress
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Start Postgres with one of these. Both use `postgresql://openpress:openpress@localhost:5432/openpress`, which is already the `DATABASE_URL` in `apps/api/.env.example`.

```bash
# Docker
docker compose up -d

# No Docker. Leave this process running.
pnpm db:local
```

Apply schema and seed the admin user. `pnpm db:migrate` runs every file in `apps/api/db/migrations/` in order, including `001_init.sql`, `002_core_parity.sql` (visibility, autosave, custom fields, application passwords, extra roles), and `003_platform.sql` (plugin storage, trusted keys, import jobs, redirects, audit log).

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

`pnpm dev` starts the API and the Next.js app together. To run them apart: `pnpm dev:api` and `pnpm dev:web`. More detail is in [docs/running-dev.md](docs/running-dev.md) and [docs/installation.md](docs/installation.md).

### First login

Seeded account:

- Email: `admin@openpress.local`
- Password: `admin12345`

Change that password before any shared or public deploy. If you skip the seed and register through the site, the first account becomes Admin and later registrations stay closed until **Settings → General → Membership**.

Production checklist: [docs/deployment.md](docs/deployment.md).

## Project structure

```
openpress/
├── apps/
│   ├── api/                 # NestJS API, SQL migrations, plugin and theme uploads
│   │   └── db/migrations/   # 001_init.sql, 002_core_parity.sql, 003_platform.sql
│   └── web/                 # Next.js public site and /admin
├── packages/
│   ├── shared/              # Types shared by the API and the web app
│   └── themes/default/      # Built-in theme (the only theme stored in git)
├── docs/                    # Guides, API reference, parity roadmap
├── scripts/local-postgres.mjs
├── docker-compose.yml       # Postgres 16 for local development
├── CONTRIBUTING.md
└── LICENSE                  # MIT
```

Uploaded themes live in `apps/api/themes-store/`. Uploaded plugins live in `apps/api/plugins/`. Neither directory is committed.

## Themes and plugins

Themes and plugins are zip uploads from the admin. Guides: [docs/themes.md](docs/themes.md), [docs/plugins.md](docs/plugins.md).

A token theme is a `theme.json` plus optional CSS:

```json
{
  "id": "sunset",
  "name": "Sunset",
  "version": "1.0.0",
  "engine": "runtime-v1",
  "tokens": { "accent": "#ea580c", "font": "sans", "layout": "cards" }
}
```

A plugin declares which core it runs on and which capabilities it needs. Hooks are always available. Content, storage, email, network, admin pages, and the other extension points are not, unless `permissions` lists them. The admin shows that list and asks for confirmation before the plugin is installed. The plugin then runs in its own process.

```json
{
  "id": "hello-note",
  "name": "Hello Note",
  "version": "1.0.0",
  "main": "index.js",
  "requires": { "openpress": ">=0.1.0" },
  "permissions": ["admin_menu", "shortcodes"]
}
```

```js
function activate(ctx) {
  ctx.hooks.addAction('content.published', (content) => {
    ctx.logger.log(`Published: ${content.title}`);
  });

  ctx.hooks.addFilter('the_title', (title) => title);

  ctx.admin.addMenuPage({
    slug: 'hello',
    title: 'Hello Settings',
    menuTitle: 'Hello',
    fields: [{ key: 'greeting', label: 'Greeting', type: 'text' }],
  });

  ctx.shortcodes.add('hello', (attrs) => `Hello ${attrs.name || 'there'}`);
}

module.exports = { activate };
```

`addAction` / `doAction` match WordPress actions. `addFilter` / `applyFilters` match filters. Public content runs `the_title`, `the_excerpt`, `the_content`, and `content.public`. Public lists run `pre_get_posts` on the query fields (core still writes the SQL). Deactivating a plugin removes its listeners and its admin pages.

This permission list is enforced inside the plugin process. Filesystem access outside the plugin directory is denied, and `fetch` plus the network builtins are sealed. Content, storage, email, and HTTP go through the API, which checks the manifest again. A hook that runs longer than 30 seconds is killed without stopping the API. See [docs/plugins.md](docs/plugins.md).

## WordPress migration (WXR)

1. In WordPress, use **Tools → Export** and download the WXR XML.
2. In OpenPress, open **Tools → Import** (`/admin/tools/import`).
3. Upload that `.xml` file. You can also upload an OpenPress JSON export.

The importer keeps private, password, and scheduled posts (a future post stays scheduled, including its date). It also creates authors, comments, categories, tags, custom fields, featured images when the attachment URL can be downloaded, menus, and permalink redirects. Uploading the same file again updates the existing posts instead of duplicating them. Progress is shown on the Import screen. EmDash JSON dumps are not imported yet. See the [roadmap](docs/wordpress-parity-roadmap.md).

**Tools → Export** downloads the same WXR subset, or JSON, so two OpenPress sites can round-trip content.

## Documentation

| Guide | Description |
|---|---|
| [Docs index](docs/README.md) | All guides |
| [Installation](docs/installation.md) | Env vars and database options |
| [Running dev](docs/running-dev.md) | Turbo, ports, separate processes |
| [Admin guide](docs/admin-guide.md) | Day-to-day publishing |
| [Themes](docs/themes.md) | `runtime-v1` and `react-v1` |
| [Plugins](docs/plugins.md) | Manifest, permissions, actions, filters |
| [API](docs/api.md) | REST endpoints |
| [Roles](docs/roles-and-permissions.md) | Five roles and the capability map |
| [Architecture](docs/architecture.md) | How the packages fit |
| [WordPress parity roadmap](docs/wordpress-parity-roadmap.md) | What is in core, and what the next runs should build |
| [Deployment](docs/deployment.md) | Production checklist |

## Contributing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md).
2. Branch from `main`. Keep admin concepts familiar to WordPress users, and keep the implementation a typed monorepo.
3. `pnpm test` covers the API's pure core (capabilities, visibility, WXR, hooks, plugin permissions). `pnpm lint` checks the web app.
4. Open a pull request and fill in the template.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Copyright (c) OpenPress contributors.

You can use, modify, and ship OpenPress, including in commercial work.
