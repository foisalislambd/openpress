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
| Roles & capabilities | Done | Builtin roles live in `roles`. Custom roles, per-user grants and denies, and a role editor. A user's role is stored per site in `site_users`. Writes check the capability for the current site. Deny wins. A site administrator cannot be stripped. Network capabilities (`manage_network`, `manage_sites`, `manage_network_users`, `manage_network_options`) belong only to `networkAdmin`. | Better: a role on one site does not grant that role on another, and a site administrator is not a network administrator. |
| Options / settings API | Done | Typed registry (string, number, boolean, JSON), autoload flag, validation, plugin `settings.register`. | No visual settings-field builder. Better: values are validated before they are stored. |
| Content query | Done | `buildContentQuery` is the only SQL builder for lists used by REST, GraphQL, and themes. Type, post type, taxonomy, meta, status, date, search, and order are structured. Meta and tax groups support AND/OR, nested clauses, and category children. Public queries cannot ask for drafts, and the current site is forced after filters. | No `REGEXP` compares. Better: filters change the object, never the SQL string. |
| Cron | Done | `cron_events` in Postgres: one-shot and recurring, row locks, backoff, duplicate recurring hooks, and a one-year interval cap. An overdue job runs once and skips the missed intervals. Tools → Scheduled Events can run due events. BullMQ remains for imports and image work when Redis is set. | No visual calendar of every hook argument. Better: jobs survive without Redis and a long outage does not replay the backlog. |
| Menus | Done | `nav_menus` / items / locations, scoped per site. Nested items, cycle checks, safe URLs. The Menus screen drags items to reorder them and nests an item when it is dropped to the right. | No live customizer preview of the drag. Better: a parent cycle cannot be stored. |
| Widgets | Partial | Sidebar and footer instances. Core search, recent posts, categories, and text widgets render as data, not unsanitized HTML. | No customizer drag-and-drop. Better: core widgets are typed instead of PHP class instances. |
| Rewrite rules | Partial | Registry with anchored patterns, conflict detection against the active permalink structure, and middleware rewrites. Dated permalinks still use the existing resolver. | Not a full `WP_Rewrite` tag map. Better: a rule that matches `/admin` or `/api` is rejected. |
| Users & profile | Partial | User meta, staff-only `_` keys, user list filters by role, search, and capability. Application passwords, sessions, TOTP, and passkeys already exist. | No front-end membership product. |
| Hooks | Partial | Plugins can register capabilities, settings, rewrite rules, widgets, and blocks from the sandbox, and adjust `content.query`. Activation loads plugins in dependency order and refuses a cycle or a missing dependency. | No hook-reference screen. |
| Block editor | Partial | The canvas inserts the core text and layout blocks, plus pullquote and verse. It has a list view, an inspector for level and alignment, undo and redo, and copy and paste of a block. Patterns and reusable blocks stay. Preview HTML comes from the server document model. | No collaborative editing and no Gutenberg style panel. Embeds render as links, not third-party iframes. |
| Content modeling | Done | Custom post types, taxonomies, field groups, patterns, pending review, and term meta on categories, tags, and custom terms. | |
| Permalinks | Done | Structure templates route through Next.js middleware, including year/month/name. | |
| Media | Done | Derivatives, crop, rotate, srcset, WebP/AVIF, focal point, optional S3. Attachment terms attach existing taxonomy terms to a file. A PDF upload renders page one with Poppler into a PNG thumbnail. | Poppler must be installed (`pdftoppm`). Without it the file is kept and the thumbnail is skipped. |
| SEO, i18n, comments, import, REST `/wp/v2`, jobs, auth factors | Done | String catalog, gettext rows, and a `.po` compile that writes those rows, a JSON catalog, and a `.mo` file. Comments thread to five levels. `/wp/v2` adds comments and users. GraphQL can list approved comments. Marketplace UI is intentionally out of this repository. | Plural rules cover one-form languages and the English two-form rule, not every CLDR formula. |
| Multisite | Partial | `sites`, `site_options`, and `site_users`. Network admin lists sites, activates, deactivates, and deletes them, edits network settings, and reviews users. The admin switcher sends `X-OpenPress-Site`. Public pages follow the request host. | No separate database per site and no domain-mapping wizard. Roles are per site; users stay network-wide. |
| Full Gutenberg UI | Partial | The post editor uses a Gutenberg-style shell: top toolbar, writing canvas, slash and panel inserter, block toolbar, list view, and Block / Document settings. Blocks are registered with `registerBlockType` and still stored as OpenPress BlockNode JSON. | Full site editing, the pattern directory, collaboration, and PHP `parse_blocks` HTML stay out. |
| PHP plugins / gettext `.po` | Partial | PHP stays out. A `.po` file compiles to gettext rows, JSON, and `.mo`. | Not a full gettext toolchain (no `msgfmt` plural expressions). |

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
- Multisite foundation: one primary site by default, extra sites from **Tools → Sites**, content scoped to the selected site.

### Shipped in the network and editor pass

Migration `007_network_roles.sql` adds `users.networkAdmin` and `site_users`, and scopes capability grants to a site. Existing administrators become network administrators and keep their role on the primary site. Apply it with `pnpm db:migrate`.

- Per-site roles. Capability checks use the role on the current site. Network capabilities are not included in a site administrator role.
- Network admin at `/admin/network`: site list, activate, deactivate, delete, network title, and a user overview with the network-admin flag.
- Block canvas in the post and page editor: inserter, drag reorder, nesting, and a server-rendered preview.
- Drag-and-drop menus. Dropping an item to the right nests it. The API rejects a cycle.

### Shipped in the parity depth pass

Migration `008_core_parity.sql` adds `gettext_entries`, `reusable_blocks`, and `media_terms`. Apply it with `pnpm db:migrate`.

- Block canvas: more blocks, pattern insert, reusable blocks, and Alt+arrow moving.
- Plugin packages activate in dependency order. A cycle or a missing dependency is refused. Plugins still register hooks, capabilities, settings, widgets, and blocks from the sandbox.
- Theme File Editor writes `style.css` and `theme.json` into settings after a safety check. It does not rewrite a signed theme package. The customizer stores accent, background, and font with the additional CSS.
- Gettext catalog: domain, context, and plural forms. `GET /api/i18n/gettext` resolves a message.
- REST `/wp/v2/comments` and `/wp/v2/users`. GraphQL `comments(contentId)`.
- Cron: duplicate recurring schedules are returned instead of inserted, intervals are capped, and a long outage skips missed runs instead of replaying them. The cron screen can run due events.
- Media terms on an attachment. Comments nest to five levels, and the moderation screen can reply.

### Shipped in the editor and catalog pass

- Block canvas: list view, alignment in the inspector, undo and redo, copy and paste, pullquote, and verse.
- Settings → Languages compiles a `.po` file into the gettext table, a JSON catalog, and a `.mo` file.
- PDF uploads render the first page to a PNG thumbnail when `pdftoppm` is on the server.

### Shipped in the Gutenberg shell pass

- Full-screen editor chrome: document toolbar, center canvas, optional list view, and a Block / Document sidebar.
- Block inserter with search, categories, and recent blocks. Type `/` in a text block to insert.
- Selected-block toolbar: drag, move, transform, alignment, duplicate, copy, group, and remove.
- Core blocks are registered definitions. The server allowlist renders each type from its own module. Storage stays BlockNode JSON, so older posts still open.
- Editor chrome uses the WordPress Gutenberg icon set (GPL-2.0-or-later), copied from `packages/icons`. The inserter toggle, document tools, list view, and block toolbar follow the current `edit-post` / `editor` header.

### Next runs

1. **Marketplace UI** — browse a remote registry, one-click update from a URL, and theme signing. The local catalog and signature check are the contract that UI should call. This stays out of the product until the client decides.

### Explicitly later

The public plugin directory, automatic updates from a remote feed, a full Gutenberg clone, and a PHP compatibility layer stay out. The directory depends on the permission manifest above. Those are ecosystem problems, not a reason to skip the hook and manifest work. A `.po` file can already be compiled into rows, JSON, and `.mo`; plural expressions beyond the English two-form rule are still open.
