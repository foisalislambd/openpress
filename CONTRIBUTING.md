# Contributing to OpenPress

Thanks for helping improve OpenPress. This guide covers how to set up the project, make changes, and open a pull request.

## Code of conduct

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Bug reports** — use the [bug report](.github/ISSUE_TEMPLATE/bug_report.md) template
- **Feature ideas** — use the [feature request](.github/ISSUE_TEMPLATE/feature_request.md) template
- **Docs** — fix typos, clarify guides under `docs/`
- **Code** — bug fixes, features, tests, theme/plugin samples
- **Security** — see [SECURITY.md](SECURITY.md); do not open public issues for vulnerabilities

**Good first contributions:** documentation, default theme polish, sample plugins, small bug fixes, type fixes.

## Prerequisites

- Node.js **20+**
- pnpm **10+** (`corepack enable` recommended)
- PostgreSQL **14+** (Docker, local install, or `pnpm db:local`)

## Local setup

```bash
git clone <your-fork-url> openpress
cd openpress
pnpm install

# Database — pick one
docker compose up -d          # localhost:5432
# or
pnpm db:local                 # embedded Postgres on localhost:5432 (keep running)

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Adjust DATABASE_URL in apps/api/.env if needed

pnpm --filter @openpress/api exec prisma db push
pnpm db:seed
pnpm dev
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Site + admin |
| http://localhost:4000/api | REST API |

**Seeded login:** `admin@openpress.local` / `admin12345`

More detail: [docs/installation.md](docs/installation.md), [docs/running-dev.md](docs/running-dev.md), [docs/development.md](docs/development.md).

## Development workflow

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b fix/short-description
   # or
   git checkout -b feat/short-description
   ```
2. Make focused changes — one concern per PR when possible.
3. Check your work:
   ```bash
   pnpm --filter @openpress/web lint
   pnpm --filter @openpress/web exec tsc --noEmit
   pnpm --filter @openpress/api build
   ```
4. Push and open a pull request using the [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## Project layout (where to edit)

| Area | Path |
|------|------|
| API (NestJS, Prisma) | `apps/api/` |
| Web (Next.js site + admin) | `apps/web/` |
| Shared types | `packages/shared/` |
| Default theme | `packages/themes/default/` |
| Docs | `docs/` |

Do **not** commit:

- `.env` files
- `apps/api/plugins/` or `apps/api/themes-store/` (user uploads)
- `uploads/`, `.pgdata/`, build artifacts

## Coding guidelines

- Match existing style in the file you edit (TypeScript, NestJS modules, Next.js App Router).
- Prefer small, readable changes over large refactors in the same PR.
- Keep public API and admin UX consistent with current patterns.
- Update docs when behavior or setup steps change.
- Never commit secrets, API keys, or production credentials.

## Pull request checklist

- [ ] Clear title and description (what + why)
- [ ] Linked issue (if any)
- [ ] Lint / typecheck / build pass for touched packages
- [ ] Docs updated when needed
- [ ] No unrelated formatting-only churn

## Commit messages

Use short, imperative messages focused on **why**:

```
fix: prevent comment rate limit from blocking admins
feat: add S3 media storage option
docs: clarify embedded Postgres setup on Windows
```

## Questions

- Architecture: [docs/architecture.md](docs/architecture.md)
- Themes / plugins: [docs/themes.md](docs/themes.md), [docs/plugins.md](docs/plugins.md)
- Distribution & licensing: [docs/distribution.md](docs/distribution.md)

Open a GitHub Discussion or issue if something is unclear — learning-friendly questions are welcome.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
