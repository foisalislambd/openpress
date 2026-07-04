# Deployment

Production checklist for OpenPress.

## Build

```bash
pnpm install
pnpm --filter @openpress/api exec prisma generate
pnpm --filter @openpress/api exec prisma migrate deploy   # or db push for small setups
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
```

### Web

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
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

- [ ] Change `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Set `WEB_ORIGIN` (do not leave CORS open)
- [ ] Use HTTPS everywhere
- [ ] `allowRegistration` false unless needed
- [ ] Strong admin passwords
- [ ] Only install trusted plugin/theme zips
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
- **DB** — single PostgreSQL; connection pool via Prisma

## Docker (future)

Current repo includes `docker-compose.yml` for **Postgres only**. Full container images for API/web are not shipped yet — build your own Dockerfile per app or use Node on a VM.

## Health checks

- API: `GET /api/settings` should return 200
- Web: `GET /` should return 200

## Logs

- NestJS stdout — API errors, plugin logs
- Next.js stdout — SSR errors, theme bundle load failures

Monitor for failed theme builds on upload and plugin `activate()` errors on boot.
