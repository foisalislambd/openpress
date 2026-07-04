import type { ThemeDefinition } from '@openpress/shared';
import defaultTheme from '@openpress/theme-default';
import minimalTheme from '@openpress/theme-minimal';

// Theme registry: to add a theme, create a package under packages/themes/,
// add it to transpilePackages in next.config.ts, and register it here.
const themes: Record<string, ThemeDefinition> = {
  [defaultTheme.manifest.id]: defaultTheme,
  [minimalTheme.manifest.id]: minimalTheme,
};

export function getTheme(id: string): ThemeDefinition {
  return themes[id] ?? defaultTheme;
}

export function listThemes(): ThemeDefinition['manifest'][] {
  return Object.values(themes).map((t) => t.manifest);
}
