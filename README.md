# OpenPress

A modern, open-source alternative to WordPress — built with **NestJS**, **Next.js** and **PostgreSQL**.

## Features

- **Block editor** — Notion/Gutenberg-style editing powered by BlockNote
- **Posts & pages** — drafts, publishing, slugs, SEO fields, revisions
- **Media library** — upload and manage images and files
- **Categories, tags & comments** — with moderation
- **Users & roles** — Admin / Editor / Author
- **Theme system** — themes are React component packages; switch from the admin panel (ships with two themes)
- **Plugin-ready** — the API emits hook events (`content.published`, `comment.created`, ...) that a plugin system can subscribe to

## Stack

| Layer | Tech |
| --- | --- |
| API | NestJS 11, Prisma, PostgreSQL, JWT auth |
| Web | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Editor | BlockNote |
| Monorepo | pnpm workspaces + Turborepo |

## Getting started

Requirements: Node.js >= 20, pnpm.

```bash
pnpm install

# 1. Start PostgreSQL (pick one):
docker compose up -d        # with Docker (port 5432)
pnpm db:local               # OR embedded Postgres, no Docker needed (port 55432, keep running)
# OR use any existing PostgreSQL server

# then make sure DATABASE_URL in apps/api/.env points to your database

# 2. Set up env + database (in a new terminal):
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm --filter @openpress/api exec prisma db push
pnpm db:seed

# 3. Run everything:
pnpm dev
```

- Public site: http://localhost:3000
- Admin panel: http://localhost:3000/admin
- API: http://localhost:4000/api

Seeded admin login: `admin@openpress.local` / `admin12345`
(Or register the first account from `/admin/login` — the first user automatically becomes Admin.)

## Project structure

```
apps/
  api/            # NestJS REST API (auth, content, media, comments, settings)
  web/            # Next.js public site + /admin dashboard
packages/
  shared/         # shared TypeScript types (incl. ThemeDefinition)
  themes/
    default/      # built-in default theme (only theme in git)
```

## Creating a theme

1. Create a zip with `theme.json` and your React components (`engine: "react-v1"`) or design tokens (`engine: "runtime-v1"`). See sample zips in your test folder.
2. Upload via Admin → Themes.
3. Activate it in Admin → Themes.

Uploaded themes are stored in `apps/api/themes-store/` (not in git).
Plugins are stored in `apps/api/plugins/` (not in git).

## Roadmap

- Plugin system (server-side plugins subscribing to hook events, admin UI extensions)
- Theme customizer (colors, fonts, menus)
- S3/media storage adapters, image resizing
- Multilingual content

## License

MIT
