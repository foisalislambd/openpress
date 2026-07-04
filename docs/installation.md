# Installation

## Requirements

- **Node.js** 20 or newer
- **pnpm** 10+ (`npm install -g pnpm`)
- **PostgreSQL** 14+ (Docker, local install, or embedded — see below)

## 1. Clone and install

```bash
git clone <your-repo-url> openpress
cd openpress
pnpm install
```

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
pnpm --filter @openpress/api exec prisma db push
pnpm db:seed
```

Seed creates:

- Admin user: `admin@openpress.local` / `admin12345`
- Sample post, About page, category, tag

## 5. Run

```bash
pnpm dev
```

Starts API (port 4000) and web (port 3000) via Turborepo.

## First login

1. Open http://localhost:3000/admin
2. Sign in with the seeded admin, **or**
3. Register the first account — it automatically becomes **Admin**

After the first user exists, public registration is **disabled** until you enable it in **Settings → Membership**.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `P1000` / auth failed | Check `DATABASE_URL` matches your Postgres user/password |
| Port 5432 in use | Use `pnpm db:local` (5432) or change port in Docker |
| Prisma generate fails (TLS) | Run with `NODE_TLS_REJECT_UNAUTHORIZED=0` once, or fix corporate proxy certs |
| Admin shows "Forbidden" | Log out and back in after role change; only **Admin** can change settings/themes |
