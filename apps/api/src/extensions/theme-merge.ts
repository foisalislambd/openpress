export interface ThemeContribution {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  engine?: string;
  parent?: string;
  tokens?: Record<string, string>;
  templates?: string[];
  templateParts?: string[];
  menuLocations?: { id: string; label: string }[];
  widgetAreas?: string[];
  settings?: { key: string; type?: string; label?: string; default?: string }[];
  patterns?: { name: string; title: string; blocks?: unknown[] }[];
  styles?: { block: string; name: string; label: string }[];
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function mergeThemeManifest<T extends ThemeContribution>(child: T, parent: ThemeContribution | null): T {
  if (!parent || parent.id === child.id) return sanitizeTheme(child);
  const settings = new Map<string, { key: string; type?: string; label?: string; default?: string }>();
  for (const setting of [...(parent.settings ?? []), ...(child.settings ?? [])]) {
    if (setting && ID_RE.test(setting.key)) settings.set(setting.key, setting);
  }
  const patterns = new Map<string, { name: string; title: string; blocks?: unknown[] }>();
  for (const pattern of [...(parent.patterns ?? []), ...(child.patterns ?? [])]) {
    if (pattern?.name && pattern.title) patterns.set(pattern.name, pattern);
  }
  const styles = new Map<string, { block: string; name: string; label: string }>();
  for (const style of [...(parent.styles ?? []), ...(child.styles ?? [])]) {
    if (style && ID_RE.test(style.name) && /^[a-z0-9/-]{1,80}$/.test(style.block)) styles.set(`${style.block}:${style.name}`, style);
  }
  return sanitizeTheme({
    ...parent,
    ...child,
    id: child.id,
    parent: child.parent,
    tokens: { ...(parent.tokens ?? {}), ...(child.tokens ?? {}) },
    templates: unique([...(parent.templates ?? []), ...(child.templates ?? [])]),
    templateParts: unique([...(parent.templateParts ?? []), ...(child.templateParts ?? [])]),
    menuLocations: (child.menuLocations?.length ? child.menuLocations : parent.menuLocations) ?? [],
    widgetAreas: (child.widgetAreas?.length ? child.widgetAreas : parent.widgetAreas) ?? [],
    settings: [...settings.values()],
    patterns: [...patterns.values()],
    styles: [...styles.values()],
  });
}

function sanitizeTheme<T extends ThemeContribution>(theme: T): T {
  return {
    ...theme,
    menuLocations: (theme.menuLocations ?? []).filter((item) => item && ID_RE.test(item.id)).slice(0, 12),
    widgetAreas: (theme.widgetAreas ?? []).filter((area) => ID_RE.test(area)).slice(0, 12),
    settings: (theme.settings ?? []).filter((item) => item && ID_RE.test(item.key)).slice(0, 40),
    styles: (theme.styles ?? []).filter((item) => item && ID_RE.test(item.name)).slice(0, 40),
    patterns: (theme.patterns ?? []).filter((item) => item?.name && item.title).slice(0, 40),
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => /^[a-z0-9][a-z0-9-]{0,60}$/.test(value)))];
}
