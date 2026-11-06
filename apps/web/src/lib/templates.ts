import { createElement, type ComponentType } from 'react';
import type { ThemeArchiveProps, ThemeDefinition, ThemeHomeProps, ThemeSingleProps } from '@openpress/shared';

type ThemeView = ComponentType<ThemeHomeProps> | ComponentType<ThemeSingleProps> | ComponentType<ThemeArchiveProps>;

export function pickTemplate(theme: ThemeDefinition, names: string[], fallback: ThemeView): ThemeView {
  const templates = theme.templates ?? {};
  for (const name of names) {
    const found = templates[name];
    if (found) return found;
  }
  return fallback;
}

/** Render a hierarchy template without assigning a component inside a page function. */
export function renderTemplate<P extends ThemeHomeProps | ThemeSingleProps | ThemeArchiveProps>(
  theme: ThemeDefinition,
  names: string[],
  fallback: ComponentType<P>,
  props: P,
) {
  const chosen = pickTemplate(theme, names, fallback as unknown as ThemeView) as ComponentType<P>;
  return createElement(chosen, props);
}

export type { ThemeArchiveProps, ThemeHomeProps, ThemeSingleProps };
