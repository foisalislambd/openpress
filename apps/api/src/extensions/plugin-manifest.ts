export const OPENPRESS_VERSION = '0.1.0';

/** Declared in plugin.json. Hooks are always available; everything else is opt-in. */
export const PLUGIN_PERMISSIONS = [
  'database',
  'settings',
  'admin_menu',
  'rest',
  'assets',
  'widgets',
  'shortcodes',
  'blocks',
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  /** Semver range against OpenPress core, e.g. ">=0.1.0" or "^0.1.0". */
  requires?: { openpress?: string };
  permissions?: PluginPermission[];
}

const ID_RE = /^[a-z0-9][a-z0-9-_]*$/;

export function parseVersion(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function cmp(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/** Supports *, exact x.y.z, >=x.y.z, and ^x.y.z. Missing range is compatible. */
export function versionSatisfies(range: string | undefined, version = OPENPRESS_VERSION) {
  if (!range || range.trim() === '' || range.trim() === '*') return true;
  const current = parseVersion(version);
  if (!current) return false;
  const trimmed = range.trim();
  if (trimmed.startsWith('^')) {
    const base = parseVersion(trimmed.slice(1));
    if (!base) return false;
    const nextMajor = [base[0] + 1, 0, 0] as const;
    return cmp(current, base) >= 0 && cmp(current, nextMajor) < 0;
  }
  if (trimmed.startsWith('>=')) {
    const base = parseVersion(trimmed.slice(2));
    return Boolean(base) && cmp(current, base!) >= 0;
  }
  const exact = parseVersion(trimmed);
  return Boolean(exact) && cmp(current, exact!) === 0;
}

export function validatePluginManifest(manifest: PluginManifest) {
  if (!manifest?.id || !ID_RE.test(manifest.id)) {
    throw new Error('plugin.json must contain a lowercase alphanumeric "id"');
  }
  if (!manifest.name || !manifest.version || !manifest.main) {
    throw new Error('plugin.json must contain "name", "version" and "main"');
  }
  if (manifest.main.includes('..') || manifest.main.startsWith('/')) {
    throw new Error('Invalid "main" path');
  }
  const permissions = manifest.permissions ?? [];
  if (!Array.isArray(permissions)) throw new Error('permissions must be an array');
  for (const permission of permissions) {
    if (!PLUGIN_PERMISSIONS.includes(permission)) {
      throw new Error(`Unknown plugin permission "${permission}"`);
    }
  }
  const required = manifest.requires?.openpress;
  if (required && !versionSatisfies(required)) {
    throw new Error(
      `Plugin requires OpenPress ${required}, this core is ${OPENPRESS_VERSION}`,
    );
  }
}
