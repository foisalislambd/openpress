import type { ThemeDefinition } from '@openpress/shared';
import defaultTheme from '@openpress/theme-default';
import minimalTheme from '@openpress/theme-minimal';
import { buildRuntimeTheme, RuntimeThemeManifest } from './runtime-theme';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Built-in theme registry: code themes shipped as workspace packages.
// Uploaded themes (zip, "runtime-v1" engine) are loaded from the API at runtime.
const builtInThemes: Record<string, ThemeDefinition> = {
  [defaultTheme.manifest.id]: defaultTheme,
  [minimalTheme.manifest.id]: minimalTheme,
};

export async function resolveTheme(id: string): Promise<ThemeDefinition> {
  if (builtInThemes[id]) return builtInThemes[id];
  try {
    const res = await fetch(`${API_URL}/api/themes/installed/${id}`, {
      next: { revalidate: 10 },
    });
    if (res.ok) {
      const manifest = (await res.json()) as RuntimeThemeManifest;
      return buildRuntimeTheme(manifest);
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
