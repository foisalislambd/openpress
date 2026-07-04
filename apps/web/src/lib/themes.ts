import type { ThemeDefinition } from '@openpress/shared';
import defaultTheme from '@openpress/theme-default';
import { buildRuntimeTheme, RuntimeThemeManifest } from './runtime-theme';
import { loadCodeTheme } from './code-theme';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Built-in theme registry: only default ships in the repo.
// All other themes are uploaded via Admin → Themes (zip).
const builtInThemes: Record<string, ThemeDefinition> = {
  [defaultTheme.manifest.id]: defaultTheme,
};

export async function resolveTheme(id: string): Promise<ThemeDefinition> {
  if (builtInThemes[id]) return builtInThemes[id];
  try {
    const res = await fetch(`${API_URL}/api/themes/installed/${id}`, {
      next: { revalidate: 10 },
    });
    if (res.ok) {
      const manifest = (await res.json()) as Omit<
        RuntimeThemeManifest,
        'engine'
      > & {
        engine: 'runtime-v1' | 'react-v1';
        updatedAt: number;
      };
      if (manifest.engine === 'react-v1') {
        const theme = await loadCodeTheme(
          manifest.id,
          manifest.version,
          manifest.updatedAt,
        );
        if (theme) return theme;
      } else {
        return buildRuntimeTheme(manifest as RuntimeThemeManifest);
      }
    }
  } catch {
    // fall through to default
  }
  return defaultTheme;
}

export function listBuiltInThemes() {
  return Object.values(builtInThemes).map((t) => ({
    ...t.manifest,
    builtIn: true,
  }));
}
