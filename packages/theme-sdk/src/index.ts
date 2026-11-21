/** Public contract for an OpenPress theme package. */

export type ThemeEngine = 'runtime-v1' | 'template-v1' | 'react-v1';
export type ThemeFont = 'sans' | 'serif' | 'mono';
export type ThemeLayout = 'cards' | 'list';

export interface ThemeTokens {
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  accent?: string;
  accentText?: string;
  headerBackground?: string;
  headerText?: string;
  font?: ThemeFont;
  radius?: string;
  layout?: ThemeLayout;
  maxWidth?: string;
}

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  engine: ThemeEngine;
  tokens?: ThemeTokens;
  /** Entry file for a `react-v1` theme. */
  entry?: string;
  /** npm packages this theme imports. Installed when THEME_INSTALL_DEPS=true. */
  dependencies?: Record<string, string>;
  /** Template hierarchy names this theme implements, such as single-post. */
  templates?: string[];
  /** Partial names in parts/, such as header. */
  templateParts?: string[];
  /** Installed theme id. Missing templates are read from the parent. */
  parent?: string;
  menuLocations?: { id: string; label: string }[];
  widgetAreas?: string[];
  /** Customizer-style settings. Values are escaped when a template prints them. */
  settings?: { key: string; type?: 'string' | 'number' | 'boolean'; label?: string; default?: string }[];
  patterns?: { name: string; title: string; blocks?: unknown[] }[];
}

export function defineTheme<T extends ThemeManifest>(manifest: T): T {
  return manifest;
}

export { renderThemeTemplate, sanitizeThemeHtml, splitYield } from './templates.js';
export type { ThemeTemplateData } from './templates.js';
