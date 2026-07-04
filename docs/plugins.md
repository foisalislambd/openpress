# Plugins

Plugins extend OpenPress on the **server**. They subscribe to CMS events and can use the database (Prisma).

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
  "main": "index.js"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Lowercase `a-z`, `0-9`, `-`, `_` |
| `name` | Yes | Display name |
| `version` | Yes | Semver string |
| `main` | Yes | Entry file relative to plugin root |
| `description`, `author` | No | Shown in admin |

## Entry file

Must export `activate` (CommonJS):

```js
function activate(ctx) {
  ctx.logger.log('Plugin started');

  ctx.hooks.on('content.published', (content) => {
    ctx.logger.log(`Published: ${content.title}`);
  });
}

module.exports = { activate };
```

## Plugin context (`ctx`)

| Property | Description |
|----------|-------------|
| `ctx.hooks.on(event, fn)` | Subscribe to an event |
| `ctx.logger` | NestJS `Logger` prefixed with `plugin:<id>` |
| `ctx.db` | Prisma client (same as API) |
| `ctx.manifest` | Parsed `plugin.json` |

## Available hooks

| Event | When | Payload |
|-------|------|---------|
| `content.created` | Post/page created | Full content object |
| `content.updated` | Post/page updated | Full content object |
| `content.published` | Status becomes PUBLISHED | Full content object |
| `content.deleted` | Post/page deleted | Deleted content |
| `comment.created` | New comment | Comment object |
| `settings.updated` | Site settings saved | Settings object |

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
  ctx.hooks.on('content.published', async (content) => {
    if (content.excerpt || content.type !== 'POST') return;
    const excerpt = textFromBlocks(content.blocks);
    if (!excerpt) return;
    await ctx.db.content.update({
      where: { id: content.id },
      data: { excerpt },
    });
    ctx.logger.log(`Excerpt set for "${content.title}"`);
  });
}

module.exports = { activate };
```

## Lifecycle

1. **Upload** — zip extracted to `apps/api/plugins/<id>/`, enabled by default, `activate()` runs
2. **Disable** — hook listeners removed, files stay on disk
3. **Enable** — `activate()` runs again
4. **Delete** — unloaded, folder removed
5. **API restart** — all enabled plugins load automatically

## Admin API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/plugins` | Admin |
| POST | `/api/plugins/upload` | Admin (multipart `file`) |
| PATCH | `/api/plugins/:id/toggle` | Admin |
| DELETE | `/api/plugins/:id` | Admin |

## Security

Plugins run with **full server access** (database, filesystem via Prisma, event bus). Treat them like WordPress PHP plugins:

- Only install trusted zips
- Review `index.js` before enabling in production
- No sandbox or permission model yet (roadmap)

## Packaging a zip

From the plugin folder parent:

```bash
# files at zip root (not wrapped in extra folder name)
zip -r my-plugin.zip plugin.json index.js
```

On Windows (PowerShell):

```powershell
Compress-Archive -Path my-plugin\* -DestinationPath my-plugin.zip
```

The zip may also contain a single top-level folder; `plugin.json` is found automatically.
