# Development

## Monorepo layout

```
openpress/
  apps/
    api/                 # NestJS — run from here for Prisma
    web/                 # Next.js
  packages/
    shared/              # types
    themes/
      default/           # built-in theme only
  scripts/
    local-postgres.mjs   # embedded DB helper
  docs/                  # you are here
```

Managed by **pnpm workspaces** + **Turborepo**.

## Common commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | **API (4000) + Web (3000)** via Turbo — [full guide](running-dev.md) |
| `pnpm dev:api` | Backend only |
| `pnpm dev:web` | Frontend only |
| `pnpm build` | Build all packages |
| `pnpm --filter @openpress/api dev` | API only |
| `pnpm --filter @openpress/web dev` | Web only |
| `pnpm db:seed` | Run seed script |
| `pnpm db:local` | Embedded PostgreSQL |
| `pnpm --filter @openpress/api exec prisma studio` | DB GUI |
| `pnpm --filter @openpress/api exec prisma db push` | Sync schema |
| `pnpm --filter @openpress/web exec tsc --noEmit` | Typecheck web |

## Environment

Copy `.env.example` files — never commit real `.env` files.

API runs from `apps/api/` — Prisma resolves `DATABASE_URL` from `apps/api/.env`.

## Database changes

1. Edit `apps/api/prisma/schema.prisma`
2. `pnpm --filter @openpress/api exec prisma db push` (dev) or `prisma migrate dev` (migrations)
3. `pnpm --filter @openpress/api exec prisma generate`

## Adding a workspace package

1. Create folder under `packages/`
2. Add to `pnpm-workspace.yaml` if nested (e.g. `packages/themes/*`)
3. `pnpm install` from root
4. Reference with `"@openpress/my-pkg": "workspace:*"`

## Web: admin vs public

- **Public routes** — `apps/web/src/app/(site)/` — Server Components, fetch API with `revalidate`
- **Admin routes** — `apps/web/src/app/admin/` — Client Components, `client-api.ts` with JWT in `localStorage`

## Testing uploaded extensions locally

Themes and plugins are **not** in git. After upload they live in:

- `apps/api/themes-store/`
- `apps/api/plugins/`

Restart API after manual file edits to plugins (upload via admin is preferred).

## Git ignore

| Path | Reason |
|------|--------|
| `apps/api/plugins/` | User-installed plugins |
| `apps/api/themes-store/` | User-installed themes |
| `packages/themes/*` except `default/` | Optional local themes |
| `uploads/`, `.pgdata/`, `*.tsbuildinfo` | Runtime artifacts |

## Linting

```bash
pnpm --filter @openpress/web lint    # eslint (Next 16 flat config)
pnpm --filter @openpress/api build   # Nest compile = typecheck
```

## Debugging API

Nest logs to console. Plugin logs appear as `[plugin:<id>]`.

Hook events: `content.created`, `content.updated`, `content.published`, `content.deleted`, `comment.created`, `settings.updated`.

## Prisma on Windows

If `prisma generate` fails with certificate errors:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
pnpm --filter @openpress/api exec prisma generate
```

Fix corporate proxy/CA certs for a permanent solution.

## Ports

| Service | Default |
|---------|---------|
| Web | 3000 |
| API | 4000 |
| Postgres (Docker) | 5432 |
| Postgres (embedded) | 5432 |
