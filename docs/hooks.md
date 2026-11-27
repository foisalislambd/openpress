# Hooks

Plugins register with `ctx.hooks.addAction` and `ctx.hooks.addFilter`. Core fires the hooks below. A plugin may also call `ctx.hooks.doAction` and `ctx.hooks.applyFilters` for its own names. Filters run in priority order and may be async. A hook that runs longer than 30 seconds stops that plugin process.

`user_has_cap` can turn an allowed check into a denial. A filter cannot grant a capability the user does not have.

## Actions

| Hook | When | Payload |
|------|------|---------|
| `plugins_loaded` | Enabled plugins have finished `activate()` | none |
| `init` | After `plugins_loaded` on startup | none |
| `plugin.activated` | One plugin finished activate, install, and migrations | `{ id, version }` |
| `plugin.deactivated` | An administrator disabled the plugin, before its listeners are removed | `{ id }` |
| `plugin.uninstalled` | The plugin folder is being deleted | `{ id }` |
| `content.created` | A post or page was created | Content |
| `content.updated` | A post or page was updated | Content |
| `content.published` | Status became `PUBLISHED` | Content |
| `content.deleted` | A post or page was deleted | Content |
| `save_post` | After create or update | Content |
| `delete_post` | After delete | Content |
| `comment.created` | A comment was stored | Comment |
| `comment.status_changed` | A plugin or moderator changed comment status | Comment |
| `settings.updated` | Site settings were saved | Settings |
| `user_register` | A new account was created | `{ id, email, role }` |
| `wp_login` | Password (and MFA, when required) succeeded | `{ id, email, role }` |
| `wp_login_failed` | The password was wrong, or `authenticate` refused the attempt | `{ email }` |
| `wp_logout` | A session was revoked | `{ userId }` |
| `template_redirect` | A public post or page is about to be rendered | `{ id, slug, type, postType }` |
| Cron hook | `ctx.cron.schedule({ hook })` | The action name is `<plugin-id>.<hook>` |

## Filters

| Hook | Value | When |
|------|-------|------|
| `content.blocks` | Block array | Before a post or page is saved |
| `content.query` | Query object | Before core builds a content list. Core rebuilds SQL from the returned fields |
| `content.public` | Public content | Before a public response |
| `the_title` | Title string | After `content.public` |
| `the_excerpt` | Excerpt string | After `content.public` |
| `the_content` | Block array | After shortcodes |
| `pre_get_posts` | `{ type, search, category, tag, page, perPage }` | Public lists |
| `document_title` | Document title | After the SEO title is built |
| `template_include` | Template name array | Public content. Names must match `^[a-z0-9-]{1,80}$` |
| `wp_head` | Array of `<meta>` and `<link>` tags | Public chrome. Other tags are dropped |
| `wp_footer` | Array of plain-text lines | Public chrome |
| `authenticate` | `{ email, ok }` | Before the password check. `ok: false` rejects the login. The filter does not receive the password and cannot skip it |
| `user_has_cap` | `{ userId, capability, allowed }` | During a capability check. `allowed: false` denies. `true` does not grant |
| `wp_mail` | `{ to, subject, text }` | Before mail is queued or a plugin sends mail |
| `comment_text` | Comment body | Before a comment is stored |
| `rest_post_dispatch` | `{ items, total }` | WordPress-compatible post list |
| `graphql_response` | GraphQL result | After `POST /api/graphql` |
| `assistant.complete` | Assistant input | Before the assistant returns |

## Lifecycle

These are not global hooks. They run inside the plugin that registered them:

| Registration | When |
|--------------|------|
| `ctx.lifecycle.onInstall` | The first successful activate for this id |
| `ctx.lifecycle.onDeactivate` | The plugin is disabled |
| `ctx.lifecycle.onUninstall` | The plugin is deleted |
| `ctx.migrations.add(version, fn)` | That version has not been recorded yet |
