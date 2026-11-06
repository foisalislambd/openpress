# OpenPress → WordPress parity roadmap

Audit of the NestJS + Next.js + PostgreSQL monorepo against WordPress core (wp-admin, Gutenberg, and the REST/hooks model). Status reflects the tree **after** the core-parity work in this branch. “Better than WordPress” calls out places we should not copy PHP-era limits.

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

| WordPress capability | OpenPress now | Gap that remains |
|----------------------|---------------|------------------|
| Block editor | BlockNote, not Gutenberg blocks or patterns | Pattern directory, reusable blocks, synced patterns, collaborative editing |
| Revisions & autosave | Revision on explicit save **and** a separate autosave that does not create a revision | Side-by-side diff, revision authors in the compare UI beyond the existing panel |
| Visibility | Public, private, password-protected. Password posts are redacted until unlock | Per-post sharing links with expiry longer than the unlock token |
| Statuses | Draft, pending-by-role (contributors cannot publish), scheduled (publisher runs every 30s), published, trash | “Pending review” as its own status distinct from draft |
| Taxonomies | Categories and tags | Custom taxonomies, term meta, default category enforcement |
| Custom post types & fields | `content_meta` key/value on posts and pages | Registered post types, field groups, REST field schema |
| Media | Dimensions, alt, caption, thumbnail/medium/large via `sharp`, numeric crop | Srcset in the theme, image editor UI (rotate, flip), PDF thumbnails |
| Menus | Named menu assigned to **primary** and **footer** locations, rendered by the default theme | Drag-and-drop nesting, several menus, items generated from pages and categories |
| Widgets / sidebars | Sidebar and footer areas. Core text widgets and plugin widget types render in the default theme | Search, recent posts, and categories as real widgets; customizer placement |
| Customizer | Site title and tagline with a live iframe | Theme mods, additional CSS, widgets and menus inside the customizer |
| Permalinks | Slug field. `permalinkStructure` is stored only | Pretty-permalink templates actually routing (`/yyyy/mm/slug`) |
| Comments | Moderation setting honored, closed comments, link-spam heuristic, public form, IP stored for moderators | Akismet-class scoring, email notifications, commenter accounts on the public form |
| Roles & capabilities | Admin, Editor, Author, Contributor, Subscriber with an explicit capability map | Custom roles, per-user caps, UI to edit the map |
| Application passwords | Create, list, revoke. HTTP Basic auth on the same routes as JWT | Last-used display in more screens, app-password-only REST scope |
| REST API | Resource-oriented `/api/*` | `/wp/v2` compatibility shims for existing WP clients |
| Hooks | `addAction` / `doAction` and `addFilter` / `applyFilters`, including `the_title`, `the_excerpt`, `the_content`, `content.public`, `content.blocks`, `pre_get_posts` | Hook reference UI |
| Plugins | Separate process per plugin. Filesystem permission model plus sealed network builtins. Capability RPC for content, storage, email, and an HTTP allow list. Permission review before install. Ed25519 package signatures and rollback | Public marketplace UI, remote update feeds, theme sandbox. `database` no longer means raw SQL |
| Themes | React layouts, primary/footer menu locations, sidebar and footer widget areas, plugin asset tags | Template hierarchy (`single-post`, `archive-category`), theme npm dependencies, `theme.json` design tokens beyond runtime themes |
| Search | Admin ILIKE/full-text and a public `/search` page | Relevance ranking UI, search in pages+media |
| RSS & sitemaps | `/feed` (RSS 2.0) and `/sitemap.xml` | Comment feeds, image sitemap, news sitemap |
| SEO | Per-item title and description | Open Graph images, canonical, schema.org |
| Import / export | WXR import keeps private, password, sticky, and scheduled posts, downloads public attachments, creates authors and comments, stores custom fields, imports menu items, writes permalink redirects, and reports progress. Re-running uses `wxrId` | EmDash JSON dumps, a guided field mapper, and comment threading from WXR |
| Multisite | Not started | Network admin, per-site tables, domain mapping — later on purpose |
| i18n | `siteLanguage` setting only | String catalog, locale packs, RTL |
| Accessibility | Focus rings, labels on many admin controls | Full keyboard audit of the block editor, contrast pass, skip links |

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

### Next runs

1. **Marketplace UI** — browse a remote registry, one-click update from a URL, and theme signing. The local catalog and signature check are the contract that UI should call. This stays out of the product until the client decides.

### Explicitly later

Multisite and a network admin, the public plugin directory itself, automatic updates from a remote feed, a Gutenberg clone, and a PHP compatibility layer. The directory depends on the permission manifest above. Those are ecosystem problems, not a reason to skip the hook and manifest work. Full gettext catalogs and a visual theme-file editor are still open; the string catalog and template hierarchy are the foundation.
