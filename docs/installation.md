# Installation

## Requirements

- **Node.js** 20 or newer
- **pnpm** 10+ (`npm install -g pnpm`)
- **PostgreSQL** 14+ (Docker, local install, or embedded — see below)

## 1. Clone and install

```bash
git clone https://github.com/foisalislambd/openpress.git
cd openpress
pnpm install
```

### Or scaffold a new directory with create-openpress

Available from this checkout, or from a tarball packed in this checkout. **Not published.** `npx create-openpress` and `npm create openpress` do not work yet. The npm name is provisional.

```bash
node packages/create-openpress/bin/create-openpress.mjs --help
node packages/create-openpress/bin/create-openpress.mjs ../my-site --yes
```

`--yes` writes gitignored env files, runs `pnpm install --frozen-lockfile`, and does not migrate or seed. The destination must be empty and must sit outside this checkout. Then use the generated `SETUP.md`. The commands below are the same for a checkout and for a generated project.

Tarball, without publishing:

```bash
pnpm --filter create-openpress pack --pack-destination /tmp/openpress-cli
tar -xzf /tmp/openpress-cli/create-openpress-1.0.7.tgz -C /tmp/openpress-cli
node /tmp/openpress-cli/package/bin/create-openpress.mjs "/tmp/my site" --yes --skip-install
```

Flags and errors: [packages/create-openpress/README.md](../packages/create-openpress/README.md).

## 2. Database

Choose one option.

### Option A — Docker (recommended)

```bash
docker compose up -d
```

Uses `postgresql://openpress:openpress@localhost:5432/openpress`.

### Option B — Embedded Postgres (no Docker)

```bash
pnpm db:local
```

Keep this terminal open. Default port is **5432** (Windows may block 5432).

### Option C — Existing PostgreSQL

Create a database and user, then set `DATABASE_URL` in `apps/api/.env`.

## 3. Environment files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### API (`apps/api/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token secret (change in production) |
| `JWT_REFRESH_SECRET` | Refresh token secret |
| `PORT` | API port (default `4000`) |
| `UPLOAD_DIR` | Media upload folder (default `./uploads`) |
| `WEB_ORIGIN` | Optional CORS origin for production |

### Web (`apps/web/.env`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | API URL (default `http://localhost:4000`) |

## 4. Migrate and seed

```bash
pnpm db:migrate
pnpm db:seed
```

Seed creates:

- Admin user: `admin@openpress.local` / `admin12345`
- Sample post, About page, category, tag

## 5. Run

```bash
pnpm dev
```

Starts API (port 4000) and web (port 3000) via Turborepo. Stop both with Ctrl+C.

Build, then start the compiled services:

```bash
pnpm build
pnpm --filter @openpress/api start
pnpm --filter @openpress/web start
```

`pnpm db:migrate` applies every numbered SQL file in `apps/api/db/migrations`. It does not drop the database. Health check: http://localhost:4000/api/health.

## First login

1. Open http://localhost:3000/admin
2. Sign in with the seeded admin, **or**
3. Register the first account — it automatically becomes **Admin**

After the first user exists, public registration is **disabled** until you enable it in **Settings → Membership**.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Password authentication failed | Check `DATABASE_URL` in `apps/api/.env` without pasting that file into a ticket |
| `create-openpress` says the directory is not empty | Pick a new path. The CLI does not replace existing files |
| `npx create-openpress` fails | Expected until a future publish. Use `node packages/create-openpress/bin/create-openpress.mjs` from a checkout |
| Port 5432 in use | Stop the other Postgres process, or change the port in `docker-compose.yml` / `scripts/local-postgres.mjs` and update `DATABASE_URL` |
| Admin shows "Forbidden" | Log out and back in after role change; only **Admin** can change settings/themes |
