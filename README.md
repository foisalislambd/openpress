# OpenPress

**A modern, open-source CMS — the WordPress experience rebuilt for developers.**

OpenPress gives you familiar CMS power (posts, pages, media, themes, plugins, roles) on a **TypeScript stack** you actually want to maintain: NestJS, Next.js, PostgreSQL, and React.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is OpenPress?

OpenPress is a **content management system** you can self-host. It ships with:

- A **public website** (themes, posts, pages, archives)
- An **admin panel** at `/admin` (dashboard, block editor, media library)
- A **REST API** for headless use or integrations
- **Theme & plugin systems** — extend the site without touching core code

Think of it as **WordPress concepts + modern web architecture**.

---

## Why OpenPress exists

WordPress powers a huge part of the web — but for many teams the **cost of ownership** has grown:

| Pain point | WordPress today | OpenPress approach |
|------------|-----------------|-------------------|
| Stack | PHP + MySQL, legacy patterns | TypeScript, NestJS, Next.js, PostgreSQL |
| Frontend | Themes in PHP templates | **React components** — upload full code themes |
| API | REST exists but ecosystem is fragmented | **API-first** from day one |
| Performance | Plugins + PHP can slow sites | SSR/SSG with Next.js, lean core |
| Developer experience | Hooks in PHP, mixed quality | **Typed** monorepo, Prisma, modern tooling |
| Security surface | Large plugin ecosystem risk | Smaller core; plugins are explicit server modules |
| Hosting | Often shared hosting + wp-admin | Run on any Node + Postgres host (VPS, Docker, cloud) |

**We built OpenPress** for developers and teams who want:

- A **blog, marketing site, or content hub** without WordPress lock-in
- **Full control** over frontend (React themes) and backend (NestJS modules)
- **Open source** (MIT) — fork it, host it, sell services on top of it
- A **learning foundation** for CMS architecture (auth, roles, hooks, themes)

OpenPress is **not** trying to clone every WordPress feature on day one. It focuses on a **solid core** (content, users, media, themes, plugins) that you can grow with the community.

---

## Who is it for?

- **Developers** building client sites who prefer React/Node over PHP
- **Startups** needing a self-hosted blog or docs site with an admin UI
- **Agencies** shipping custom themes as zip packages (full React code)
- **Learners** studying how a real CMS is structured (monorepo, API, extensions)
- **Open-source contributors** who want a clear, modern codebase to improve

---

## Key benefits

| Benefit | What you get |
|---------|----------------|
| **Modern stack** | NestJS + Next.js 16 + React 19 + PostgreSQL — hire-friendly, well documented |
| **Block editor** | Notion/Gutenberg-style editing (BlockNote) — no shortcode hell |
| **Real theme system** | Upload themes as zip: token-based **or** full React components (`react-v1`) |
| **Real plugin system** | Server plugins with hooks (`content.published`, `comment.created`, …) |
| **Roles** | Admin / Editor / Author — same mental model as WordPress |
| **Self-hosted** | Your data, your server, no SaaS lock-in |
| **MIT license** | Use commercially, modify freely, no royalties |
| **Monorepo** | One repo: API, web, shared types, default theme |
| **Headless-ready** | Public site uses the API; you can build other clients on the same API |

---

## Features

### Content

- **Posts & pages** — drafts, publish, schedule-ready schema, slugs, excerpts
- **Block editor** — rich content stored as JSON blocks
- **Revisions** — snapshot on each save
- **SEO fields** — per post/page meta
- **Categories & tags**

### Media & community

- **Media library** — images, video, PDF (typed upload validation)
- **Comments** — guests + logged-in users, moderation queue

### Users & security

- **JWT auth** — access + refresh tokens
- **Roles** — Admin, Editor, Author ([permissions guide](docs/roles-and-permissions.md))
- **Rate limiting** — brute-force protection on login and comments
- **Registration toggle** — first user is Admin; public signup optional

### Extensions

- **Themes** — built-in default + upload zip ([theme guide](docs/themes.md))
  - `runtime-v1` — design tokens + CSS (quick themes)
  - `react-v1` — your own JSX components, bundled on upload
- **Plugins** — upload zip, hook into CMS events ([plugin guide](docs/plugins.md))

### Admin panel

Dashboard, content editor, media, taxonomy, comments, users, settings, theme picker, plugin manager — all at `/admin`.

---

## How themes & plugins work

```
Developer builds zip  →  Admin uploads  →  Stored on server  →  Live on site
```

| Extension | Stored in | In git? |
|-----------|-----------|---------|
| Default theme | `packages/themes/default/` | Yes |
| Uploaded themes | `apps/api/themes-store/<id>/` | No |
| Uploaded plugins | `apps/api/plugins/<id>/` | No |

**Plugins** = server-side JavaScript (`activate(ctx)` with `hooks`, `db`, `logger`).  
**Themes** = React layouts (`Layout`, `Home`, `Post`, `Page`, `Archive`) or token-based styling.

Sample zips for testing: build your own or see the [plugins](docs/plugins.md) and [themes](docs/themes.md) guides.

---

## Quick start

**Requirements:** Node.js 20+, pnpm 10+, PostgreSQL 14+

```bash
git clone <your-repo-url> openpress
cd openpress
pnpm install

# 1. Database (pick one)
docker compose up -d    # Docker → localhost:5432
pnpm db:local           # Embedded Postgres → localhost:55432 (keep running)

# 2. Environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit DATABASE_URL in apps/api/.env if needed

# 3. Database setup
pnpm --filter @openpress/api exec prisma db push
pnpm db:seed

# 4. Run API + frontend (Turbo — both at once)
pnpm dev
```

| URL | Service |
|-----|---------|
| http://localhost:3000 | Frontend (site + admin) |
| http://localhost:4000/api | Backend API |

**Run separately:** `pnpm dev:api` · `pnpm dev:web` — see [Running dev guide](docs/running-dev.md).

**Seeded login:** `admin@openpress.local` / `admin12345`

> The **first registered user** always becomes Admin. After that, registration is off until enabled in **Settings → Membership**.

Detailed setup: [docs/installation.md](docs/installation.md)

---

## Documentation

| Guide | Description |
|-------|-------------|
| [📖 Docs index](docs/README.md) | Start here |
| [Installation](docs/installation.md) | Database, env vars, troubleshooting |
| [Running dev (Turbo)](docs/running-dev.md) | **Backend + frontend together**, separate commands |
| [Admin guide](docs/admin-guide.md) | Using the dashboard |
| [Themes](docs/themes.md) | Build & upload themes (`react-v1`, `runtime-v1`) |
| [Plugins](docs/plugins.md) | Build & upload plugins + hooks |
| [API reference](docs/api.md) | REST endpoints |
| [Architecture](docs/architecture.md) | How the system fits together |
| [Roles & permissions](docs/roles-and-permissions.md) | Admin / Editor / Author |
| [Development](docs/development.md) | Monorepo, scripts, contributing locally |
| [Deployment](docs/deployment.md) | Production checklist |
| [Distribution](docs/distribution.md) | Open source: releases, MIT, themes, plugins, self-hosting |

---

## Project structure

```
openpress/
├── apps/
│   ├── api/                 # NestJS REST API, Prisma, plugins, theme store
│   └── web/                 # Next.js — public site + /admin
├── packages/
│   ├── shared/              # Shared TypeScript types
│   └── themes/
│       └── default/         # Built-in theme (only theme in git)
├── docs/                    # Full documentation
├── .github/                 # Issue & PR templates
├── scripts/
│   └── local-postgres.mjs   # Dev Postgres without Docker
├── docker-compose.yml       # PostgreSQL for local dev
├── CONTRIBUTING.md          # How to contribute
├── CODE_OF_CONDUCT.md       # Community standards
├── SECURITY.md              # Vulnerability reporting
├── CHANGELOG.md             # Release notes
├── LICENSE                  # MIT
└── README.md                # You are here
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **API** | NestJS 11, Prisma ORM, PostgreSQL, JWT, EventEmitter hooks |
| **Web** | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| **Editor** | BlockNote |
| **Build** | pnpm workspaces, Turborepo |
| **Theme bundling** | esbuild (for uploaded `react-v1` themes) |

---

## Roadmap

Community contributions welcome on:

- [ ] Plugin admin UI extensions (settings pages in dashboard)
- [ ] Theme customizer (live preview, menus)
- [ ] S3 / object storage for media
- [ ] Image resizing & optimization pipeline
- [ ] Multilingual content
- [ ] Webhooks for external integrations
- [ ] Docker images for API + web

---

## Contributing

OpenPress is **open source** and grows with the community.

1. **Star & fork** the repo
2. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md)
3. Pick an issue or propose a feature
4. Open a PR with a clear description

**Good first contributions:** docs, default theme improvements, sample plugins, bug fixes, tests.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

---

## FAQ

**Is OpenPress production-ready?**  
Core CMS features are implemented and audited. For production, follow [deployment guide](docs/deployment.md), change JWT secrets, and only install trusted plugins/themes.

**Can I use it headless?**  
Yes. The REST API exposes public content endpoints. The included Next.js app is one frontend; you can build mobile apps or other sites against the same API.

**WordPress migration?**  
Not built-in yet. Content would need a custom import script (API supports block JSON posts).

**Why MIT?**  
Maximum freedom for personal, commercial, and educational use.

---

## License

[MIT](LICENSE) — Copyright (c) OpenPress contributors.

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of this software.

---

<p align="center">
  <strong>OpenPress</strong> — open source CMS for the modern web.<br>
  <a href="docs/README.md">Documentation</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="docs/themes.md">Themes</a> ·
  <a href="docs/plugins.md">Plugins</a>
</p>
