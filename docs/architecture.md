# Architecture

## Overview

OpenPress is a **pnpm monorepo** with two apps and shared packages.

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser                                 │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  Public site (/)    │  │  Admin panel (/admin)       │   │
│  │  Next.js RSC        │  │  Next.js client components  │   │
│  └──────────┬──────────┘  └──────────────┬──────────────┘   │
└─────────────┼─────────────────────────────┼─────────────────┘
              │         REST + JWT            │
              ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│              NestJS API (apps/api) — port 4000              │
│  Auth │ Content │ Media │ Taxonomy │ Comments │ Settings    │
│  Extensions (themes upload, plugins loader + hooks)          │
└─────────────────────────────┬───────────────────────────────┘
                              │ Prisma
                              ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    └─────────────────┘
```

## Apps

### `apps/api` — NestJS backend

| Module | Responsibility |
|--------|----------------|
| `auth` | JWT login, register, refresh, roles guard |
| `content` | Posts, pages, revisions, slugs, events |
| `media` | File uploads to `UPLOAD_DIR` |
| `taxonomy` | Categories, tags |
| `comments` | Guest/user comments, moderation |
| `settings` | Key/value site config |
| `extensions` | Theme zip install, plugin zip install + hook bus |
| `users` | User CRUD (admin) |

Event bus: `@nestjs/event-emitter`. Plugins subscribe via `ctx.hooks.on()`.

### `apps/web` — Next.js frontend

| Route group | Purpose |
|-------------|---------|
| `(site)/` | Public theme-rendered pages |
| `admin/` | Dashboard (client-side, talks to API) |
| `api/themes` | Proxy list of built-in + uploaded themes |

Theme resolution (`lib/themes.ts`):

1. Built-in `default` from `packages/themes/default`
2. Uploaded `react-v1` — load `bundle.js`, evaluate server-side
3. Uploaded `runtime-v1` — token-based renderer
4. Fallback to default

## Packages

### `packages/shared`

TypeScript types shared between web and themes: `Content`, `User`, `ThemeDefinition`, etc.

### `packages/themes/default`

Only built-in theme committed to git. Exports `Layout`, `Home`, `Post`, `Page`, `Archive`, `BlockRenderer`.

## Data model (Prisma)

| Model | Purpose |
|-------|---------|
| `User` | Accounts, roles |
| `Content` | Posts and pages (`type`, `blocks` JSON, `seo` JSON) |
| `Revision` | Content snapshots on edit |
| `Category`, `Tag` | Taxonomy |
| `Media` | Uploaded files metadata |
| `Comment` | Threaded comments |
| `Setting` | Key/value (site config, enabled plugins list) |

## Extension storage

| Extension | Path | Loaded by |
|-----------|------|-----------|
| Uploaded theme | `apps/api/themes-store/<id>/` | Web `resolveTheme()` |
| Uploaded plugin | `apps/api/plugins/<id>/` | API `PluginsService` on boot |
| Media files | `apps/api/uploads/` | Static `/uploads` |

## Content format

Body is **BlockNote JSON** stored in `Content.blocks`. Themes receive `blocks` and render them (default `BlockRenderer` or custom).

## Security layers

- JWT on protected routes
- `RolesGuard` for Admin / Editor actions
- Author scoped to own posts
- Settings whitelist (no internal keys exposed)
- Rate limiting (`@nestjs/throttler`)
- Zip-slip protection on theme/plugin extract
- Media MIME whitelist

## Request flow (publish post)

1. Admin saves post → `PATCH /api/content/:id`
2. `ContentService` writes DB, creates revision
3. Emits `content.updated`; if newly published → `content.published`
4. Plugins with hooks run (e.g. auto-excerpt)
5. Public site fetches `GET /api/content/public` on next request (cached ~10s)
