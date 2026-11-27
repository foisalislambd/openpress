# Plugins

Plugins extend OpenPress on the **server**. They register actions and filters, and may opt into admin pages, settings, widgets, shortcodes, editor blocks, REST routes, and frontend assets. The API is named the way WordPress developers expect (`addAction`, `addFilter`, `doAction`, `applyFilters`).

## Storage

```
apps/api/plugins/<plugin-id>/
  plugin.json
  index.js          # or path from plugin.json "main"
```

**Not stored in git** — install via **Admin → Plugins → Upload plugin (.zip)**.

## Zip structure

```
hello-logger/
  plugin.json
  index.js
```

### plugin.json

```json
{
  "id": "hello-logger",
  "name": "Hello Logger",
  "version": "1.0.0",
  "description": "Logs content events",
  "author": "Your Name",
  "main": "index.js",
  "requires": { "openpress": ">=0.1.0" },
  "permissions": ["database"]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Lowercase `a-z`, `0-9`, `-`, `_` |
| `name` | Yes | Display name |
| `version` | Yes | Semver string |
| `main` | Yes | Entry file relative to plugin root |
| `requires.openpress` | No | `*`, exact `x.y.z`, `>=x.y.z`, or `^x.y.z`. Missing means compatible. Core is `0.1.0` |
| `permissions` | No | Missing or `[]` means hooks only. See the table below |
| `allowedHosts` | No | Hostnames `ctx.http.fetch` may call. Required for `network:request` |
| `description`, `author` | No | Shown in admin |

### Permissions

| Permission | Unlocks |
|------------|---------|
| `content:read` | `ctx.content.list` and `ctx.content.get` |
| `content:write` | `ctx.content.create` and `ctx.content.update` |
| `storage` | `ctx.storage.get` / `set` / `delete` for this plugin only |
| `network:request` | `ctx.http.fetch` to `allowedHosts` only. Private addresses are refused |
| `email:send` | `ctx.email.send` queues a row in `outbound_mail` |
| `settings` | `ctx.settings.get` / `set` for this plugin's options (`plugin:<id>`) |
| `admin_menu` | `ctx.admin.addMenuPage` |
| `rest` | `ctx.rest.route` under `/api/plugins/<id>/rest/` |
| `assets` | `ctx.assets.enqueueStyle` / `enqueueScript` |
| `widgets` | `ctx.widgets.register` |
| `shortcodes` | `ctx.shortcodes.add` |
| `blocks` | `ctx.blocks.register` with attributes, an optional isolated editor HTML file, and a server render function |
| `data` | `ctx.data` collections and `ctx.migrations`. Not raw SQL |
| `cron` | `ctx.cron.schedule` / `unschedule`. The fired hook is `<plugin-id>.<hook>` |
| `users:read` | `ctx.users.list` / `get`. Password hashes and sessions are not included |
| `users:write` | `ctx.users.grant` for a capability this plugin registered. Core admin capabilities are refused |
| `comments` | `ctx.comments.list`, `create` (pending), and `moderate` |
| `media` | `ctx.media.list` |
| `modeling` | `ctx.content.types.register` and `ctx.content.taxonomies.register` |
| `i18n` | `ctx.i18n.load` and `ctx.i18n.t` for this plugin's text domain |
| `graphql` | `ctx.graphql.type`, `query`, and `mutation`. Resolvers run in the sandbox. Mutations require a signed-in session |
| `database` | Parsed for older manifests. `ctx.db` throws. Use `data` or `content:*` |

An admin screen with `screen: "app"` and `entry` points at an HTML file in the plugin. OpenPress serves that file inside an iframe with `sandbox="allow-scripts"` and without `allow-same-origin`. The document is an opaque origin, so it cannot read `op_access` or `op_csrf`. Its content security policy sets `connect-src 'none'`, so the bundle cannot call the API itself. `window.openpress.call(method, path, body)` posts a message to the admin page. The admin page checks the message came from that iframe and repeats it, with the session cookie and CSRF header, to a REST route this plugin registered. A route passed `{ auth: true }` rejects anonymous callers.

A block `editor` file uses the same iframe. `window.openpress.setAttributes` sends attribute changes. `window.onOpenPressBlock` receives the current attributes. The public page uses the block's `render` function. Returned HTML is sanitized.

Hooks do not require a permission. Each plugin runs in its own Node process with the permission model (filesystem outside the plugin directory is denied) and sealed `fetch`, `http`, and `fs` requires. Actions and filters still use `addAction` and `addFilter`; the parent runs them by RPC. A hook that runs longer than 30 seconds is killed without taking down the API. Memory is capped at 128MB.

Install shows a permission review before the plugin is activated. A zip may include `openpress-signature.json` (ed25519 over the package hash). Signatures from keys in `trusted_keys` are marked trusted. An invalid signature is rejected. Unsigned packages can still be installed after the admin confirms the review.

`POST /api/plugins/:id/rollback` restores the previous on-disk release. Update checks compare installed versions with the `packageCatalog` setting.

## Entry file

Must export `activate` (CommonJS):

```js
function activate(ctx) {
  ctx.hooks.addAction('content.published', (content) => {
    ctx.logger.log(`Published: ${content.title}`);
  }, 10);

  ctx.hooks.addFilter('the_title', (title) => `${title}`);
}

module.exports = { activate };
```

`ctx.hooks.on` is an alias of `addAction` at priority 10.

## Plugin context (`ctx`)

| Property | Description |
|----------|-------------|
| `ctx.hooks.addAction(event, fn, priority?)` | WordPress `add_action` |
| `ctx.hooks.doAction(event, ...args)` | WordPress `do_action` |
| `ctx.hooks.addFilter(hook, fn, priority?)` | WordPress `add_filter`. Return the value (may be async) |
| `ctx.hooks.applyFilters(hook, value, ...args)` | WordPress `apply_filters` |
| `ctx.hooks.on(event, fn)` | Alias of `addAction` |
| `ctx.logger` | Forwards log lines to the API logger |
| `ctx.db` | Always throws. Raw SQL is not available in the sandbox |
| `ctx.content` | Requires `content:read` or `content:write`. `list`, `get`, `create`, `update` |
| `ctx.storage` | Requires `storage`. Key/value rows scoped to this plugin |
| `ctx.http.fetch(url, init?)` | Requires `network:request` and a public host on `allowedHosts` |
| `ctx.email.send({ to, subject, text })` | Requires `email:send`. Queues `outbound_mail` |
| `ctx.settings.get()` / `set(values)` | Requires `settings`. Own options only |
| `ctx.admin.addMenuPage({ slug, title, menuTitle, fields })` | Requires `admin_menu` |
| `ctx.widgets.register({ id, name, render })` | Requires `widgets`. Place it in Appearance → Widgets as `pluginId/id` |
| `ctx.shortcodes.add(tag, render)` | Requires `shortcodes`. Output is HTML-escaped |
| `ctx.blocks.register({ name, title, description })` | Requires `blocks` |
| `ctx.rest.route(method, path, handler)` | Requires `rest` |
| `ctx.assets.enqueueStyle(handle, file)` | Requires `assets`. `file` is relative to the plugin directory and must be enqueued to be served |
| `ctx.manifest` | Parsed `plugin.json` |

## Actions

| Event | When | Payload |
|-------|------|---------|
| `content.created` | Post/page created | Full content object |
| `content.updated` | Post/page updated | Full content object |
| `content.published` | Status becomes PUBLISHED | Full content object |
| `content.deleted` | Post/page deleted | Deleted content |
| `comment.created` | New comment | Comment object |
| `settings.updated` | Site settings saved | Settings object |

## Filters

| Hook | Value | When |
|------|-------|------|
| `content.blocks` | Block array | Before a post or page is saved |
| `content.public` | Public content object | Before a public response |
| `the_title` | Title string | After `content.public` |
| `the_excerpt` | Excerpt string | After `content.public` |
| `the_content` | Block array | After shortcodes, after `content.public` |
| `pre_get_posts` | `{ type, search, category, tag, page, perPage }` | Public lists only. Core rebuilds SQL from the returned fields |

Shortcodes in block text (`[greet name="Ada"]`) run before `the_content`.

### Example: auto excerpt

```js
function textFromBlocks(blocks, limit = 160) {
  let text = '';
  for (const block of blocks || []) {
    if (Array.isArray(block.content)) {
      for (const node of block.content) {
        if (node?.text) text += node.text + ' ';
      }
    }
  }
  text = text.trim();
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function activate(ctx) {
  ctx.hooks.addAction('content.published', async (content) => {
    if (content.excerpt || content.type !== 'POST') return;
    const excerpt = textFromBlocks(content.blocks);
    if (!excerpt) return;
    await ctx.content.update(content.id, { excerpt });
  });
}

module.exports = { activate };
```

That example needs `"permissions": ["content:write"]` and `"requires": { "openpress": ">=0.1.0" }`.

### Example: settings page and shortcode

```js
function activate(ctx) {
  ctx.admin.addMenuPage({
    slug: 'hello',
    title: 'Hello Settings',
    menuTitle: 'Hello',
    fields: [{ key: 'greeting', label: 'Greeting', type: 'text' }],
  });
  ctx.shortcodes.add('hello', () => 'Hello');
}

module.exports = { activate };
```

Permissions: `admin_menu`, `shortcodes`. The page is `/admin/plugin/<id>/hello`. Saved values live in the `plugin:<id>` settings row and only include declared field keys.

## Getting started

```bash
node packages/create-openpress/bin/create-openpress.mjs plugin my-plugin ./my-plugin
```

That writes `plugin.json` and `index.js`. Zip the folder and upload it from Admin → Plugins. Examples in this repo:

| Example | What it proves |
|---------|----------------|
| `examples/plugins/seo` | Settings screen, `document_title`, `the_excerpt`, `wp_head`, and a block with an editor field |
| `examples/plugins/contact-form` | A collection, migration, admin list, and a form whose submit handler stores entries |
| `examples/plugins/books` | Custom post type, taxonomy, meta box, content screen, and a daily cron hook |

Apply `apps/api/db/migrations/010_plugin_platform.sql` with `pnpm db:migrate` before using collections or migrations.

`ctx.db` always throws. A collection is a named set of fields. Filters are objects (`{ status: 'new' }` or `{ email: { contains: 'ada' } }`). Field names that are not in the schema are rejected, and they are never pasted into SQL as identifiers.

Admin screens:

- `screen: 'form'` saves the declared fields into this plugin's settings.
- `screen: 'list'` renders a table from a collection.
- `screen: 'content'` lists and creates drafts of a post type. Open `/admin/posts/new?postType=book` for the block editor.
- `screen: 'html'` is shown in a sandboxed frame with scripts removed.
- `addMetaBox` adds fields to the post editor. Keys are saved as content meta.
- `addDashboardWidget` and `notice` show on the dashboard and admin shell.
- `forms.register` builds the form HTML in core. A shortcode may return `{{form:id}}`. Core posts the values to the submit handler. The default theme escapes block text, so place the form where HTML is rendered or call the REST route.

`user_has_cap` may deny a capability. It cannot grant one the user does not already have. Grant plugin-owned capabilities with `ctx.users.grant`.

Hooks that core fires are listed in [hooks.md](hooks.md).

Optional exports and registrations:

- `ctx.lifecycle.onInstall`, `onDeactivate`, `onUninstall`
- `ctx.migrations.add('1.1.0', fn)` runs once per version, in version order
- `dependencies` in `plugin.json` names plugin ids that must be active first
- `removeData: true` deletes collections, migration rows, and storage when the plugin is deleted

## Lifecycle

1. **Upload** — zip extracted to `apps/api/plugins/<id>/`, enabled by default, `activate()` runs
2. **Disable** — hook listeners and registrations removed, files stay on disk
3. **Enable** — `activate()` runs again
4. **Delete** — unloaded, folder removed
5. **API restart** — all enabled plugins load automatically. A failed load is stored and shown in the plugins list

## Admin API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/plugins` | Admin |
| GET | `/api/plugins/registry` | Admin. Menus, blocks, widget types |
| GET | `/api/plugins/chrome` | Public. Enqueued assets, blocks, rendered widget areas |
| GET | `/api/plugins/files/:id/*file` | Public, only for an enqueued file inside that plugin directory |
| ALL | `/api/plugins/:id/rest/*path` | Public route table for that plugin |
| GET | `/api/plugins/:id/settings/:slug` | Admin |
| PATCH | `/api/plugins/:id/settings/:slug` | Admin |
| POST | `/api/plugins/upload` | Admin (multipart `file`) |
| PATCH | `/api/plugins/:id/toggle` | Admin |
| DELETE | `/api/plugins/:id` | Admin |

## Packaging a zip

From the plugin folder parent:

```bash
zip -r my-plugin.zip plugin.json index.js
```

On Windows (PowerShell):

```powershell
Compress-Archive -Path my-plugin\* -DestinationPath my-plugin.zip
```

The zip may also contain a single top-level folder; `plugin.json` is found automatically.
