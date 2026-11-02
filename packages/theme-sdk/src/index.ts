/** Public contract for an OpenPress theme package. */

export type ThemeEngine = 'runtime-v1' | 'react-v1';
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
}

export function defineTheme<T extends ThemeManifest>(manifest: T): T {
  return manifest;
}
