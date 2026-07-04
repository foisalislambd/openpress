# Running backend & frontend (Turbo)

OpenPress is a **pnpm monorepo** orchestrated by **Turborepo**. Two apps matter for daily development:

| App | Package | Port | What it is |
|-----|---------|------|------------|
| **Backend** | `@openpress/api` | **4000** | NestJS REST API |
| **Frontend** | `@openpress/web` | **3000** | Next.js (public site + `/admin`) |

PostgreSQL must be running separately (Docker, `pnpm db:local`, or your own server).

---

## Recommended: run both together

From the **repo root**:

```bash
pnpm dev
```

This runs **API + Web in parallel** via Turbo:

```
@openpress/api#dev  →  nest start --watch   (port 4000)
@openpress/web#dev  →  next dev -p 3000     (port 3000)
```

You should see **two** processes in one terminal (Turbo prefixes logs with package name).

| URL | Service |
|-----|---------|
| http://localhost:3000 | Frontend |
| http://localhost:3000/admin | Admin panel |
| http://localhost:4000/api | Backend API |

Press **Ctrl+C** once to stop both.

---

## Run only one app

Sometimes you only need API or only Web.

### Backend only

```bash
pnpm dev:api
# same as:
pnpm --filter @openpress/api dev
```

### Frontend only

```bash
pnpm dev:web
# same as:
pnpm --filter @openpress/web dev
```

> If you run **only** `dev:web`, the site will load but API calls fail until the backend is up on port 4000.

---

## How Turbo fits in

```
openpress/                    ← you run commands here
├── package.json              ← "dev": turbo run dev --filter=...
├── turbo.json                ← defines dev task (persistent, no cache)
├── apps/
│   ├── api/package.json      ← script: "dev": "nest start --watch"
│   └── web/package.json      ← script: "dev": "next dev -p 3000"
└── packages/                 ← shared libs (no dev server)
```

- **pnpm** installs dependencies and links workspace packages.
- **Turbo** runs the same `dev` script in multiple packages **in parallel**.
- We **filter** to `@openpress/api` and `@openpress/web` only — shared/theme packages have no dev server.

### Other Turbo commands

```bash
# Production build (API + Web)
pnpm build

# Build one app
pnpm build:api
pnpm build:web

# Lint web
pnpm lint
```

---

## Full dev workflow (first time)

**Terminal 1 — database** (if not using Docker in background):

```bash
docker compose up -d
# OR
pnpm db:local
```

**Terminal 2 — apps**:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm --filter @openpress/api exec prisma db push
pnpm db:seed
pnpm dev
```

---

## Troubleshooting

### `pnpm dev` shows only backend / no frontend

**Cause:** Older config ran `turbo run dev` on *all* workspace packages. Packages like `@openpress/shared` have no `dev` script, which confused Turbo on some setups.

**Fix:** Use the updated root script (already in repo):

```json
"dev": "turbo run dev --filter=@openpress/api --filter=@openpress/web"
```

Or run separately in two terminals:

```bash
pnpm dev:api
pnpm dev:web
```

### Port already in use

| Port | App |
|------|-----|
| 3000 | Next.js — change in `apps/web/package.json` `dev` script |
| 4000 | NestJS — set `PORT` in `apps/api/.env` |

### Frontend works, data empty / login fails

- Check API: http://localhost:4000/api/settings should return JSON
- Check `apps/web/.env`: `NEXT_PUBLIC_API_URL=http://localhost:4000`
- Restart `pnpm dev` after changing `.env`

### Turbo not found

```bash
pnpm install
```

Turbo is a devDependency at the repo root.

### See what Turbo will run (dry run)

```bash
pnpm turbo run dev --filter=@openpress/api --filter=@openpress/web --dry-run
```

Should list exactly **2** tasks: `@openpress/api#dev` and `@openpress/web#dev`.

---

## Two-terminal layout (alternative)

Some developers prefer split terminals for clearer logs:

```bash
# Terminal A
pnpm dev:api

# Terminal B
pnpm dev:web
```

Same result as `pnpm dev`, easier to read on Windows.
