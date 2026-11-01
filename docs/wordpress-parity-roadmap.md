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
| Plugins | Manifest with `permissions` and `requires.openpress`. Admin pages, settings, widgets, shortcodes, blocks, REST, and enqueued assets are opt-in. Deactivate clears registrations | Process or VM sandbox. Today the gate is the context API; plugin code still runs in-process. Marketplace review has to treat `database` as full SQL |
| Themes | React layouts, primary/footer menu locations, sidebar and footer widget areas, plugin asset tags | Template hierarchy (`single-post`, `archive-category`), theme npm dependencies, `theme.json` design tokens beyond runtime themes |
| Search | Admin ILIKE/full-text and a public `/search` page | Relevance ranking UI, search in pages+media |
| RSS & sitemaps | `/feed` (RSS 2.0) and `/sitemap.xml` | Comment feeds, image sitemap, news sitemap |
| SEO | Per-item title and description | Open Graph images, canonical, schema.org |
| Import / export | JSON round-trip **and** a WXR subset (posts, pages, categories, tags, blocks) | **One-click WordPress (WXR) migration** — attachments, authors, comments, and a single admin action. This is a key adoption feature, not a nice-to-have |
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

### Next runs

1. **One-click WordPress migration** — key adoption feature. The current Tools screen imports a WXR subset (posts, pages, terms, blocks). The importer people will actually switch on is one action that also brings attachments, authors, comments, and passwords, and reports what it skipped.
2. **Plugin marketplace readiness** — the manifest, permissions, and core version range are the contract a directory can list. Still open: a real sandbox (this process trusts plugin JavaScript), review of the `database` capability, signed packages, and update feeds. Do not build the directory UI before that contract is what the marketplace will enforce.
3. **Theme system** — template hierarchy (`single`, `single-post`, `archive`, `archive-category`, `page`, `search`), theme packages that can depend on npm libraries, and a customizer that edits theme mods, additional CSS, menus, and widget areas with a live preview. Menu locations and the two widget areas already render.
4. **Editor fidelity** — revision diff, reusable blocks, pending-review status, media modal inside the editor (pick from library instead of pasting a URL).
5. **Registered types** — custom post types and custom taxonomies with capability mapping and admin menus generated from the registry.
6. **REST compatibility** — `/wp/v2/posts` style routes and `_embed`, enough for headless WP clients.
7. **Comments** — notifications, authenticated commenters, better spam features without shipping a blocklist of secrets.
8. **i18n and accessibility** — message catalog, admin skip link, editor keyboard pass.
9. **Multisite** — only after single-site capabilities, types, and themes are real. A network admin on top of a single content table would be a fake.

### Explicitly later

Multisite, the public plugin directory itself, automatic updates from a remote feed, and a PHP compatibility layer. The directory depends on the permission manifest above. Those are ecosystem problems, not a reason to skip the hook and manifest work.
