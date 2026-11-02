# @openpress/plugin-sdk

TypeScript types for an OpenPress server plugin. The running API is the source of enforcement. This package lets an editor check `plugin.json` and `activate(ctx)` against the same permissions and hooks.

```bash
npm install -D @openpress/plugin-sdk
```

Prereleases are published on the `next` dist-tag: `npm install -D @openpress/plugin-sdk@next`.

```ts
import { definePlugin, type PluginManifest } from '@openpress/plugin-sdk';

export const manifest = {
  id: 'hello-note',
  name: 'Hello Note',
  version: '1.0.0',
  main: 'index.js',
  requires: { openpress: '>=0.3.0' },
  permissions: ['shortcodes'],
} satisfies PluginManifest;

export default definePlugin((ctx) => {
  ctx.shortcodes.add('hello', (attrs) => `Hello ${attrs.name || 'there'}`);
});
```

Plugins that OpenPress loads are still CommonJS (`module.exports = { activate }`). Compile to that, or write the plugin in JavaScript and use this package only for checking. `ctx.db` is typed as `never` because the sandbox does not expose SQL.

Permission names match `docs/plugins.md` in the OpenPress repository.
