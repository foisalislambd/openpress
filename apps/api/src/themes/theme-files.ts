/** Virtual theme files. Installed theme packages stay on disk and are not rewritten. */

const FILES = new Set(['style.css', 'theme.json']);

export function themeFileError(name: string, source: string) {
  if (!FILES.has(name)) return 'Only style.css and theme.json can be edited';
  if (source.length > 50_000) return 'Theme files are limited to 50 KB';
  if (name === 'style.css') {
    const lowered = source.toLowerCase();
    if (lowered.includes('expression(') || lowered.includes('javascript:') || lowered.includes('@import') || lowered.includes('behavior:')) {
      return 'That CSS is not allowed in a theme file';
    }
    return null;
  }
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'theme.json must be an object';
    const allowed = new Set(['colors', 'fonts', 'layout']);
    const extra = Object.keys(parsed as Record<string, unknown>).filter((key) => !allowed.has(key));
    if (extra.length) return `theme.json cannot contain ${extra[0]}`;
    return null;
  } catch {
    return 'theme.json must be valid JSON';
  }
}
