# OpenPress → WordPress parity roadmap

Audit of the NestJS + Next.js + PostgreSQL monorepo against WordPress core. Status is **Done**, **Partial**, or **Missing** on `main` after the core power tranche. OpenPress stays a traditional CMS: the public site is server-rendered Next.js, not a headless-only API. There is no PHP runtime and no WordPress plugin loader.

## What already existed

| Area | State before this work |
|------|------------------------|
| Admin chrome | wp-admin-shaped shell: dashboard, posts, pages, media, comments, appearance, plugins, users, tools, settings |
| Content | Posts and pages, drafts, publish, schedule **columns**, trash via status, slugs, excerpts, BlockNote JSON, SEO JSON, revisions on save + restore |
| Taxonomy | Hierarchical categories, flat tags, public archives |
| Media | Upload whitelist, alt text, delete. `width` / `height` columns unused. Size settings stored but never applied |
| Comments | Statuses pending / approved / spam / trash, threading in the API, moderation UI. No public comment form. Moderation setting ignored |
| Users | Admin, Editor, Author. JWT access + refresh. Last-admin safeguards |
| Extensions | Zip themes (`react-v1`, `runtime-v1`), zip plugins with `hooks.on` (actions only) and unrestricted `ctx.db` |
| Settings | General, writing, reading, discussion, media, permalinks, privacy screens. Menus and widgets saved as JSON, not rendered |
| Security | Throttling, zip-slip checks, MIME allow-list, author scoping |
| Missing entirely | Tests, image derivatives, private/password posts, autosave, capabilities, application passwords, RSS, sitemap, search page, WXR, custom fields, filters |

## Gap analysis (WordPress core)

| WordPress capability | Status | OpenPress now | Still behind / better than WordPress |
|----------------------|--------|---------------|--------------------------------------|
| Roles & capabilities | Done | Builtin roles live in `roles`. Custom roles, per-user grants and denies, and a role editor. Writes check the capability, not only the role name. Deny wins. Administrator cannot be stripped or minted by another role. | No multisite super-admin. Better: checks are consistent on write routes and resolved from the database, so a grant applies without waiting for a stale token. |
| Options / settings API | Done | Typed registry (string, number, boolean, JSON), autoload flag, validation, plugin `settings.register`. | No visual settings-field builder. Better: values are validated before they are stored. |
| Content query | Done | `buildContentQuery` is the only SQL builder for lists used by REST, GraphQL, and themes. Type, post type, taxonomy, meta, status, date, search, and order are structured. Meta and tax groups support AND/OR, nested clauses, and category children. Public queries cannot ask for drafts, and the current site is forced after filters. | No `REGEXP` compares. Better: filters change the object, never the SQL string. |
| Cron | Done | `cron_events` in Postgres: one-shot and recurring, row locks, backoff. Seeded publish, trash/autosave purge, and health beat. BullMQ remains for imports and image work when Redis is set. | No cron UI for every hook argument shape. Better: jobs survive without Redis. |
| Menus | Partial | `nav_menus` / items / locations, scoped per site. Nested items, cycle checks, safe URLs. The theme reads locations. Saving the existing Menus screen copies JSON into the tables for the current site only. | No drag-and-drop. Better: a parent cycle cannot be stored, and one site cannot wipe another's menus. |
| Widgets | Partial | Sidebar and footer instances. Core search, recent posts, categories, and text widgets render as data, not unsanitized HTML. | No customizer drag-and-drop. Better: core widgets are typed instead of PHP class instances. |
| Rewrite rules | Partial | Registry with anchored patterns, conflict detection against the active permalink structure, and middleware rewrites. Dated permalinks still use the existing resolver. | Not a full `WP_Rewrite` tag map. Better: a rule that matches `/admin` or `/api` is rejected. |
| Users & profile | Partial | User meta, staff-only `_` keys, user list filters by role, search, and capability. Application passwords, sessions, TOTP, and passkeys already exist. | No front-end membership product. |
| Hooks | Partial | Plugins can register capabilities, settings, rewrite rules, and widgets from the sandbox, and adjust `content.query`. | No hook-reference screen. |
| Block editor | Partial | BlockNote in admin. Server validates and HTML-serializes the document (`POST /api/content/blocks/render`). Unknown types are rejected on save. This is a foundation, not Gutenberg. | No block canvas rewrite, patterns directory, or collaboration. |
| Content modeling | Done | Custom post types, taxonomies, field groups, patterns, pending review, and term meta on categories, tags, and custom terms. | |
| Permalinks | Done | Structure templates route through Next.js middleware, including year/month/name. | |
| Media | Done | Derivatives, crop, rotate, srcset, WebP/AVIF, focal point, optional S3. | PDF thumbnails still missing. |
| SEO, i18n, comments, import, REST `/wp/v2`, jobs, auth factors | Done | Shipped in the CMS power pack. | Marketplace UI is intentionally out of this repository. |
| Multisite | Partial | `sites` and `site_options`, a seeded primary site, and `siteId` on content, terms, media, menus, widgets, and rewrites. The admin switcher sends `X-OpenPress-Site`. Public pages follow the request host. Users and roles stay network-wide. | No per-site roles, no domain mapping UI beyond a domain column, no separate database per site. |
| Full Gutenberg UI | Missing | Not in this tranche. | The block document model is the base. |
| PHP plugins / gettext `.po` | Missing | Out of scope. | The string catalog is the translation store. |

## Where OpenPress should beat WordPress

- Typed monorepo instead of global PHP functions.
- Capability checks as data (`can(role, capability)`), tested without a database.
- Filters are async and ordered, and unloading a plugin removes both listeners and filters.
- Image derivatives are generated at upload with `sharp` (no GD lottery).
- Password unlock is a short-lived signed token, not a cookie that echoes the password.
- Autosave is not a revision, so history stays meaningful.
- Rate limits already cover login, comments, and password unlock.
- PostgreSQL full-text index sits beside ILIKE so short titles and prose both match.

## Prioritized roadmap

### Now (this branch)

1. Visibility, password posts, sticky flag, comment open/closed.
2. Autosave separate from revisions.
3. Scheduled publishing that actually runs.
4. Custom fields (`content_meta`).
5. Role capabilities including Contributor and Subscriber.
6. Application passwords.
7. Media dimensions, generated sizes, caption, crop.
8. Actions and filters (`the_title`, `the_content`, `the_excerpt`, `content.public`, `content.blocks`, `pre_get_posts`).
9. Plugin manifest: declared permissions, compatible core version, and registration for admin pages, settings, widgets, shortcodes, blocks, REST routes, and frontend assets.
10. RSS, sitemap, public search.
11. WXR import/export subset.
12. Default theme: menu locations, widget areas, plugin assets, search, RSS, comments, password gate.
13. Unit tests for the pure core (capabilities, visibility tokens, WXR, filters, plugin permissions, comment policy, image size plan).

### Done in the sandbox / migration round

1. Process-isolated plugins with enforced capabilities, per-plugin storage, a 30s hook limit, and crash isolation.
2. WXR import that preserves private and scheduled posts and pulls attachments, authors, comments, fields, menus, and redirects. Progress is a `jobs` row.
3. Signed package review, trusted keys, local catalog version check, and rollback.
4. Health check, login audit log, redirect lookup used by the Next.js middleware, and production Dockerfiles (`docker-compose.prod.yml`).

### Shipped in the CMS power pack

1. **Content modeling** — custom post types and taxonomies from the admin, field groups, synced and unsynced patterns, pending review, a revision diff, and a media modal in the editor.
2. **SEO** — Open Graph, Twitter cards, JSON-LD, canonical tags, and robots controls. Redirects were already in place.
3. **Jobs** — BullMQ on Redis for imports and image derivatives, with an inline fallback when `REDIS_URL` is unset. Signed webhooks, scoped `opk_` API keys, and `POST /api/graphql`.
4. **Auth** — TOTP, passkeys, Google and GitHub when client credentials are set, and a session list. JWT and application passwords stay.
5. **Media** — rotate, flip, and resize, srcset, WebP and AVIF, focal point, and an S3-compatible driver (`STORAGE_DRIVER=s3`). Local disk stays the default.
6. **Permalinks** — `permalinkStructure` templates resolve through Next.js middleware.
7. **Themes** — template hierarchy and customizer theme mods plus additional CSS. A theme manifest can list npm dependencies; they install when `THEME_INSTALL_DEPS=true`.
8. **REST compatibility** — `/wp-json/wp/v2` posts, pages, media, categories, and tags, with `_embed`.
9. **Comments** — email notifications when SMTP is configured, and authenticated commenters on the public form.
10. **Languages** — per-post translations, a switcher, hreflang, an admin string catalog, and `dir=rtl` for Arabic, Hebrew, Persian, and Urdu.
11. **AI and MCP** — `POST /api/mcp` tools `content.search`, `content.draft`, `content.schedule`, and `media.search`, plus an `assistant.complete` filter. The default provider is a stub unless `AI_PROVIDER=openai`.
12. **Import** — EmDash JSON (a dump or `{ records, mapping }`) and WXR comment parents plus pending status.
13. **Demo** — `POST /api/platform/demo/reset` when `DEMO_MODE=true`. Production Compose runs Redis and a worker.

### Shipped in the core power tranche

Migration `005_core_power.sql` turns `users.role` into text and adds roles, user capabilities, user meta, option autoload, cron events, nav menus, widget instances, and rewrite rules. Migration `006_core_depth.sql` adds sites, site options, term and comment meta, transients, edit locks, and a `siteId` on content, terms, media, menus, widgets, and rewrites. Apply both with `pnpm db:migrate`. Existing rows belong to the primary site. Existing menu and widget JSON is copied into the tables the next time those settings are saved. Built-in roles are seeded; the Administrator capability set cannot be reduced. No PHP was added.

### Shipped in the core depth pass

- Meta and taxonomy query trees (AND/OR, nesting, `IN` / `BETWEEN` / `EXISTS`, category children).
- Term meta and comment meta. Comment bodies and text widgets pass an HTML allow-list.
- Transients in Postgres, including from a TypeScript plugin (`settings` permission).
- Post edit locks (150 seconds). Someone with `edit_others_posts` can take over.
- Multisite foundation: one primary site by default, extra sites from **Tools → Sites**, content scoped to the selected site. Roles are still shared.

### Next runs

1. **Marketplace UI** — browse a remote registry, one-click update from a URL, and theme signing. The local catalog and signature check are the contract that UI should call. This stays out of the product until the client decides.

### Explicitly later

Per-site roles, a full network admin, the public plugin directory, automatic updates from a remote feed, a Gutenberg clone, and a PHP compatibility layer. The directory depends on the permission manifest above. Those are ecosystem problems, not a reason to skip the hook and manifest work. Full gettext catalogs and a visual theme-file editor are still open; the string catalog and template hierarchy are the foundation.
