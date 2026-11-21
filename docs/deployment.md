# Deployment

Production checklist for OpenPress.

## Images

Released versions are on GHCR. Pin the version from `VERSION.md` (see [releasing.md](releasing.md)):

```bash
docker pull ghcr.io/foisalislambd/openpress-api:0.3.0
docker pull ghcr.io/foisalislambd/openpress-web:0.3.0
```

From a GitHub checkout, `node packages/create-openpress/bin/create-openpress.mjs compose <version>` prints a Compose file that pins those images. It does not pull them. `npx create-openpress` is not published. A normal project scaffold (`create-openpress <directory>`) copies this source tree instead, and `docker-compose.prod.yml` builds images from that source. Image tags for a version exist after that version is merged to `main` and the Release workflow finishes. See [releasing.md](releasing.md).

## Build

```bash
pnpm install
pnpm db:migrate
pnpm build
```

Run:

- API: `node apps/api/dist/main.js` (or `pnpm --filter @openpress/api start`)
- Web: `pnpm --filter @openpress/web start` (port 3000)

Use a process manager (PM2, systemd, Docker) for both processes.

## Environment (production)

### API

```env
DATABASE_URL=postgresql://user:pass@host:5432/openpress
JWT_SECRET=<long-random-string>
JWT_REFRESH_SECRET=<different-long-random-string>
PORT=4000
UPLOAD_DIR=/var/openpress/uploads
WEB_ORIGIN=https://yourdomain.com
NODE_ENV=production
# Leave unset in production. Set to 1 only if you trust every installed react-v1 theme with the web server.
# OPENPRESS_CODE_THEMES=0
```

The API process exits on boot when `NODE_ENV=production` and `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, or `WEB_ORIGIN` is missing or still a documented placeholder.

### Web

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
# Same switch as the API note above. The web server is what evaluates react-v1 themes.
OPENPRESS_CODE_THEMES=0
```

Or same host with reverse proxy: `https://yourdomain.com` → web, `https://yourdomain.com/api` → API (requires proxy config).

## Reverse proxy (example)

Nginx sketch:

- `/` → Next.js `:3000`
- `/api` → NestJS `:4000`
- `/uploads` → NestJS `:4000`

Set `WEB_ORIGIN` to your public site URL for CORS.

## PostgreSQL

- Use managed Postgres (RDS, Supabase, etc.) or self-hosted
- Enable backups
- Run migrations before each deploy

## File storage

`UPLOAD_DIR` must be **persistent** across deploys. For multi-instance APIs, use shared storage (NFS, S3 adapter — roadmap).

Themes and plugins:

- `apps/api/themes-store/`
- `apps/api/plugins/`

Back these up or treat as deploy artifacts (re-upload zips).

## Security checklist

- [ ] Set `JWT_SECRET` and `JWT_REFRESH_SECRET` to different random strings of at least 32 characters
- [ ] Set `WEB_ORIGIN` to the public site origin (production refuses `*` and an empty value)
- [ ] Use HTTPS everywhere so the admin session cookie is marked Secure
- [ ] `allowRegistration` false unless needed
- [ ] Do not run `pnpm db:seed` against production (it refuses unless `ALLOW_DEMO_SEED=true`)
- [ ] Strong admin passwords
- [ ] Only install trusted plugin/theme zips. Leave `OPENPRESS_CODE_THEMES` unset unless those themes are trusted with the web server
- [ ] Rate limits enabled (default on)
- [ ] Do not expose Postgres publicly
- [ ] Keep `enabledPlugins` and internal settings non-writable via API (built-in)

## First deploy user

Either:

1. Run `pnpm db:seed` once and change admin password, or
2. Register first account on production (becomes Admin), then disable registration

## Scaling notes

- **API** — stateless except plugin runtime in memory; horizontal scale needs shared uploads + same plugin/theme folders or re-upload per instance
- **Web** — standard Next.js scaling; ISR cache is 10s on public API fetches
- **DB** — single PostgreSQL; connection pool via `pg`

## Docker

`docker-compose.yml` starts Postgres for local development. `docker-compose.prod.yml` builds the API, worker, and web images. It reads `JWT_SECRET` and `JWT_REFRESH_SECRET` from the environment and does not embed a default. Postgres is health-checked, and the API exposes `GET /api/health`.

Released images are also published to GHCR. Pin them from `VERSION.md`, or print a Compose file with `node packages/create-openpress/bin/create-openpress.mjs compose <version>`.

## Health checks

- API: `GET /api/health` returns `{ "ok": true }` when Postgres answers
- Web: `GET /` should return 200

## Logs

- NestJS stdout — API errors, plugin logs
- Next.js stdout — SSR errors, theme bundle load failures

Monitor for failed theme builds on upload and plugin `activate()` errors on boot.
