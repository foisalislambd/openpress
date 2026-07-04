# OpenPress

A modern, open-source alternative to WordPress — built with **NestJS**, **Next.js**, and **PostgreSQL**.

[License: MIT](LICENSE)

## Features

- **Block editor** — Notion/Gutenberg-style editing (BlockNote)
- **Posts & pages** — drafts, publish, slugs, SEO, revisions
- **Media library** — image and file uploads
- **Taxonomy** — categories and tags
- **Comments** — guest and logged-in, with moderation
- **Users & roles** — Admin, Editor, Author
- **Theme system** — built-in default theme + upload custom themes (zip)
- **Plugin system** — upload server-side plugins that hook into CMS events



## Quick start

```bash
pnpm install

# PostgreSQL (pick one):
docker compose up -d          # Docker
pnpm db:local               # embedded Postgres (port 5432)

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm --filter @openpress/api exec prisma db push
pnpm db:seed
pnpm dev
```


| URL                                                        | Description |
| ---------------------------------------------------------- | ----------- |
| [http://localhost:3000](http://localhost:3000)             | Public site |
| [http://localhost:3000/admin](http://localhost:3000/admin) | Admin panel |
| [http://localhost:4000/api](http://localhost:4000/api)     | REST API    |


**Default login:** `admin@openpress.local` / `admin12345`

## Documentation

Full guides live in the `[docs/](docs/)` folder:


| Guide                                                | Description                            |
| ---------------------------------------------------- | -------------------------------------- |
| [Installation](docs/installation.md)                 | Setup, database, environment variables |
| [Admin guide](docs/admin-guide.md)                   | Using the dashboard                    |
| [Themes](docs/themes.md)                             | Create and upload themes               |
| [Plugins](docs/plugins.md)                           | Create and upload plugins              |
| [API reference](docs/api.md)                         | REST endpoints                         |
| [Architecture](docs/architecture.md)                 | Project structure and data flow        |
| [Roles & permissions](docs/roles-and-permissions.md) | Admin, Editor, Author                  |
| [Development](docs/development.md)                   | Local dev, monorepo, scripts           |
| [Deployment](docs/deployment.md)                     | Production checklist                   |




## Project structure

```
openpress/
  apps/
    api/              # NestJS REST API
    web/              # Next.js (public site + /admin)
  packages/
    shared/           # shared TypeScript types
    themes/
      default/        # built-in theme (only theme in git)
  docs/               # documentation
  docker-compose.yml
```

**Uploaded extensions (not in git):**


| Type    | Location                      |
| ------- | ----------------------------- |
| Themes  | `apps/api/themes-store/<id>/` |
| Plugins | `apps/api/plugins/<id>/`      |




## Stack


| Layer    | Technology                           |
| -------- | ------------------------------------ |
| API      | NestJS 11, Prisma, PostgreSQL, JWT   |
| Web      | Next.js 16, React 19, Tailwind CSS 4 |
| Editor   | BlockNote                            |
| Monorepo | pnpm workspaces + Turborepo          |




## License

MIT — see [LICENSE](LICENSE).