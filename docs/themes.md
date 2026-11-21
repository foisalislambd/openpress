# Themes

OpenPress supports two theme engines. Both are installed as **zip uploads** from **Admin → Themes** (except the built-in default theme in git).

## Storage

| Type | Path | In git? |
|------|------|---------|
| Built-in default | `packages/themes/default/` | Yes |
| Uploaded themes | `apps/api/themes-store/<id>/` | No |

## Engine comparison

| Engine | Best for | You provide |
|--------|----------|-------------|
| `runtime-v1` | Quick token-based styling | `theme.json` + optional `style.css` |
| `template-v1` | Full layouts that stay safe in production | `theme.json` + HTML templates. Values are escaped. No JavaScript |
| `react-v1` | Trusted custom React UI | `theme.json` + React JSX/TSX + CSS. Production requires `OPENPRESS_CODE_THEMES=1` |

---

## runtime-v1 (token theme)

Simple themes defined by design tokens. OpenPress renders layout and blocks using a shared runtime.

### Zip structure

```
my-theme/
  theme.json
  style.css          # optional extra CSS
```

### theme.json example

```json
{
  "id": "sunset",
  "name": "Sunset",
  "version": "1.0.0",
  "description": "Warm orange theme",
  "author": "Your Name",
  "engine": "runtime-v1",
  "tokens": {
    "background": "#fff7ed",
    "surface": "#ffedd5",
    "text": "#431407",
    "muted": "#9a3412",
    "accent": "#ea580c",
    "accentText": "#ffffff",
    "headerBackground": "#7c2d12",
    "headerText": "#ffedd5",
    "font": "sans",
    "radius": "1rem",
    "layout": "cards",
    "maxWidth": "60rem"
  }
}
```

### Token reference

| Token | Values | Purpose |
|-------|--------|---------|
| `font` | `sans`, `serif`, `mono` | Body font stack |
| `layout` | `cards`, `list` | Homepage/archive layout |
| Other keys | CSS colors / sizes | Background, text, accent, header |

---

## template-v1 (safe full theme)

Use this when the theme needs its own markup and should install on a production site without enabling code themes. Templates are HTML. `{{title}}` and `{{site.title}}` are escaped. `{{#posts}}...{{/posts}}` repeats for an array. `{{yield}}` is where OpenPress inserts the page body or the rendered blocks. Script, iframe, and event-handler attributes are removed when the file is read.

```
harbor/
  theme.json
  style.css
  templates/
    layout.html
    index.html
    single.html
    page.html
    archive.html
  parts/
    header.html
```

`theme.json` can also declare:

| Field | Purpose |
|-------|---------|
| `parent` | Theme id. Missing templates are read from the parent. Tokens, settings, patterns, styles, menu locations, and widget areas are inherited, and the child wins when it declares the same key |
| `templates` / `templateParts` | Names the theme provides. The public site asks for `layout`, `index`, `single`, `page`, and `archive` |
| `menuLocations` | `{ id, label }` pairs. The Menus screen lists them and the layout prints `{{#menus.primary}}<a href="{{url}}">{{title}}</a>{{/menus.primary}}` |
| `widgetAreas` | Area ids such as `sidebar` and `footer`. The Widgets screen lists them. Print `{{#widgets.sidebar}}<p>{{title}}</p>{{/widgets.sidebar}}` |
| `settings` | Fields on Customize. Values are saved in theme mods and printed as `{{mods.tagline}}` |
| `patterns` | `{ name, title, blocks }` patterns. They appear in Patterns and the editor inserter while the theme is active |
| `styles` | `{ block, name, label }` block styles. The editor offers them for that block and the public page adds `is-style-<name>` |
| `tokens` | Same color and font tokens as `runtime-v1` |

`examples/themes/harbor-child` sets `"parent": "harbor"` and replaces `layout.html`. The home template still comes from Harbor.

`react-v1` bundles run in the Next.js server. Leave them off in production unless you trust the theme and set `OPENPRESS_CODE_THEMES=1`. `template-v1` does not need that flag.

Scaffold a theme with:

```bash
node packages/create-openpress/bin/create-openpress.mjs theme harbor ./harbor
```

The sample themes in this repo are `examples/themes/harbor` and `examples/themes/harbor-child`.

## react-v1 (full-code theme)

Write your own React components — any folder structure, own block renderer, own CSS.

### Zip structure

```
magazine/
  theme.json
  index.jsx              # entry (exports Layout, Home, Post, Page, Archive)
  style.css              # optional
  components/
    Layout.jsx
    PostCard.jsx
    Blocks.jsx
```

### theme.json example

```json
{
  "id": "magazine",
  "name": "Magazine",
  "version": "1.0.0",
  "description": "Bold magazine layout",
  "author": "Your Name",
  "engine": "react-v1",
  "entry": "index.jsx"
}
```

### Required exports (`index.jsx`)

```jsx
import { Layout } from './components/Layout';
// ... Home, Post, Page, Archive

export default {
  manifest: {
    name: 'Magazine',
    description: '...',
    author: '...',
  },
  Layout,   // wraps every page: header, nav, footer
  Home,     // homepage post list
  Post,     // single post + comments
  Page,     // static page
  Archive,  // category/tag archives
};
```

### Props (from `@openpress/shared`)

**Layout** — `{ settings, pages, children }`

- `settings` — site title, description, etc.
- `pages` — published pages for nav links
- `children` — page content

**Home** — `{ settings, posts }`

- `posts` — `{ items, total, page, perPage, totalPages }`

**Post / Page** — `{ settings, content, comments }`

- `content` — title, slug, blocks, author, categories, tags, …
- `comments` — approved comments (Post only)

**Archive** — `{ settings, title, posts }`

### Block content

Post/page body is **BlockNote JSON** in `content.blocks`. You can:

- Use the shared renderer from `@openpress/theme-default` (`BlockRenderer`), or
- Build your own (see sample `Blocks.jsx` in test themes)

### Build process

On upload, the API runs **esbuild** and produces `bundle.js`. Build errors are returned in the upload response — nothing is installed if the build fails.

### Imports

Themes may only `require('react')` and `react/jsx-runtime`. No npm packages inside theme zips.

### Loading custom CSS

```jsx
<link rel="stylesheet" href={`${API_URL}/api/themes/installed/magazine/style.css`} />
```

---

## Built-in default theme

Source: `packages/themes/default/`

Registered in `apps/web/src/lib/themes.ts`. To change the shipped default, edit that package and redeploy — no zip needed.

---

## Activate a theme

**Admin → Themes → Activate**, or:

```http
PUT /api/settings
Authorization: Bearer <admin-token>
Content-Type: application/json

{ "activeTheme": "magazine" }
```

Public pages cache settings for ~10 seconds before showing the new theme.

## Rules

- `id` in `theme.json` must be lowercase alphanumeric with `-` or `_`
- Zip may have files at root or inside one top-level folder
- Re-uploading the same `id` replaces the previous version
