# Distribution

How to share, ship, and distribute OpenPress as an open-source project — source code, releases, self-hosted sites, themes, and plugins.

OpenPress is released under the [MIT License](../LICENSE). You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software with minimal restrictions.

---

## What you can distribute

| Artifact | How | License |
|----------|-----|---------|
| **Source code** | GitHub repo, fork, zip/tarball | MIT — keep copyright notice |
| **Self-hosted instance** | Deploy on your server for yourself or clients | MIT — no royalties |
| **Themes** | Zip upload or share zip publicly | Your choice (MIT recommended) |
| **Plugins** | Zip upload or share zip publicly | Your choice (MIT recommended) |
| **Services** | Hosting, setup, support, custom development | Commercial — allowed |

OpenPress core is **not** published to npm as installable packages today. Distribution is **source-first**: clone the repo, build, and deploy.

---

## Source distribution (GitHub)

### For maintainers — publishing releases

1. **Tag a version** (semver recommended):

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **Create a GitHub Release** from that tag:
   - Attach **Source code (zip)** — GitHub generates this automatically
   - Write release notes: breaking changes, migration steps, new features

3. **Release checklist** before tagging:
   - [ ] `pnpm build` succeeds
   - [ ] Database migrations are committed (`apps/api/prisma/migrations/`)
   - [ ] `.env.example` files are up to date
   - [ ] Docs reflect any breaking changes
   - [ ] No secrets in the repo (`.env`, JWT keys, DB passwords)

### For users — installing from a release

```bash
# From GitHub release zip
unzip openpress-0.1.0.zip && cd openpress-0.1.0
pnpm install
# Then follow docs/installation.md
```

Or clone the default branch for latest development:

```bash
git clone https://github.com/<org>/openpress.git
cd openpress
pnpm install
```

---

## MIT license — what you must include

When you redistribute OpenPress (source or binary), you **must**:

1. Include the [MIT license text](../LICENSE) (or a copy of it)
2. Keep the copyright notice: `Copyright (c) OpenPress contributors`

You **do not** need to:

- Open-source your own modifications (though contributions back are welcome)
- Pay royalties for commercial use
- Ask permission to fork, rebrand, or resell hosting/services

If you ship a **white-label** or **forked** product, update the copyright line in your fork's `LICENSE` to reflect your changes while preserving the original MIT notice for upstream code.

---

## Self-hosting distribution

The most common way to "distribute" OpenPress is running it on a server.

### Single site (personal or client)

1. Follow [installation.md](installation.md) and [deployment.md](deployment.md)
2. Build once per deploy:

   ```bash
   pnpm install
   pnpm --filter @openpress/api exec prisma migrate deploy
   pnpm build
   ```

3. Run API + Web with a process manager (PM2, systemd, Docker)

### Agency / multi-client model

| Model | Description |
|-------|-------------|
| **One repo per client** | Fork or copy repo; customize theme/plugins per client |
| **One server, many sites** | Not supported natively yet — one OpenPress instance = one site today |
| **Managed hosting** | You operate servers; clients get admin access only |

**Backup before handoff:**

- PostgreSQL database dump
- `UPLOAD_DIR` (media files)
- `apps/api/themes-store/` (uploaded themes)
- `apps/api/plugins/` (uploaded plugins)

Do **not** hand over seed credentials (`admin@openpress.local`). Have the client set their own admin password.

---

## Theme distribution

Themes are distributed as **zip packages**, not via npm (for uploaded themes).

### Built-in default theme

Ships in git at `packages/themes/default/`. Anyone who clones the repo gets it.

### Custom themes (your work)

1. Build a zip per [themes.md](themes.md) (`runtime-v1` or `react-v1`)
2. Distribute via:
   - Direct download (your website, GitHub repo, Gumroad, etc.)
   - Client upload in **Admin → Themes**
   - Private git repo of theme source (you build zip for releases)

### Recommended `theme.json` fields for distribution

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "description": "Short description for the theme directory",
  "author": "Your Name or Company",
  "engine": "react-v1"
}
```

Use **semver** for versions. Bump `version` when you ship updates so admins know when to re-upload.

### Licensing themes

- **MIT** — easiest for open-source theme marketplaces
- **Proprietary** — allowed; you sell the zip, client installs via admin upload
- State the license in your README or a `LICENSE` file inside the zip

---

## Plugin distribution

Same model as themes: **zip packages** installed via **Admin → Plugins**.

1. Build per [plugins.md](plugins.md)
2. Share the zip publicly or sell it
3. Users upload in admin — plugins are **not** auto-installed from npm

### Security note for distributors

Plugins run server-side with database access. Only distribute plugins from sources you trust. If you run a plugin directory, consider:

- Reviewing code before listing
- Signing or checksums (SHA-256) in release notes
- Clear author and version in `plugin.json`

---

## Distribution channels (ideas)

| Channel | Best for |
|---------|----------|
| **GitHub** | Core source, issues, PRs, releases |
| **GitHub Releases** | Versioned source zips + changelog |
| **Your own docs site** | Installation guides for clients |
| **Theme/plugin repo** | Separate repos per extension |
| **Docker Hub** (custom) | Pre-built images — not official yet; see [deployment.md](deployment.md) |
| **Package registries** | Future — core is monorepo-only today |

Official Docker images for API + Web are on the [roadmap](../README.md#roadmap). Until then, build your own Dockerfile or deploy Node directly.

---

## What not to distribute

| Item | Why |
|------|-----|
| `.env` files | Contain secrets (JWT, database passwords) |
| `uploads/` | User media — privacy |
| Database dumps with real user data | GDPR / privacy |
| `apps/api/plugins/` / `themes-store/` from production | May contain third-party or proprietary zips without rights |
| Default seed password in production | Security risk |

Ship `.env.example` instead of `.env`. Document required variables in [installation.md](installation.md).

---

## Forking and rebranding

Allowed under MIT. Common steps:

1. Fork the GitHub repository
2. Update `README.md`, package names, and branding in `apps/web` if desired
3. Keep MIT license + original copyright notice
4. Deploy independently — no upstream dependency required

If you maintain a long-lived fork, document divergences so users know which docs apply.

---

## Contributing distributions back

If you build something useful for the community:

| Contribution | Where |
|--------------|-------|
| Core bug fixes / features | Pull request to main OpenPress repo |
| Default theme improvements | `packages/themes/default/` |
| Sample plugin | PR or separate repo linked in docs |
| Sample theme | PR or separate repo linked in docs |
| Docs | `docs/` — see [development.md](development.md) |

---

## Quick reference

```
OpenPress core     →  git clone / GitHub Release zip  →  MIT
Self-hosted site   →  your server + Postgres           →  MIT (no fee)
Theme zip          →  Admin upload or public download  →  your license
Plugin zip         →  Admin upload or public download  →  your license
Paid services      →  hosting, themes, support         →  always allowed
```

For install and production deploy steps, see [installation.md](installation.md) and [deployment.md](deployment.md).
