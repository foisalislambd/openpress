# @openpress/theme-sdk

TypeScript types for an OpenPress `theme.json`. Use it while authoring a `runtime-v1` token theme or a `react-v1` theme. OpenPress still installs themes from a zip upload.

```bash
npm install -D @openpress/theme-sdk
```

Prereleases use the `next` dist-tag.

```ts
import { defineTheme } from '@openpress/theme-sdk';

export default defineTheme({
  id: 'sunset',
  name: 'Sunset',
  version: '1.0.0',
  engine: 'runtime-v1',
  tokens: { accent: '#ea580c', font: 'sans', layout: 'cards' },
});
```

Token and engine names match `docs/themes.md` in the OpenPress repository.
