import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Fallback kept in sync by `pnpm release:bump`. VERSION.md wins when it is on disk. */
const FALLBACK_OPENPRESS_VERSION = '1.0.7';

function readDeclaredVersion() {
  const candidates = [
    join(__dirname, '../../../VERSION.md'),
    join(process.cwd(), 'VERSION.md'),
    join(process.cwd(), '../../VERSION.md'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const match = /^Version:\s*(\S+)\s*$/m.exec(readFileSync(file, 'utf8'));
    if (match) return match[1];
  }
  return null;
}

export const OPENPRESS_VERSION = readDeclaredVersion() ?? FALLBACK_OPENPRESS_VERSION;

/** Declared in plugin.json. Hooks are always available; everything else is opt-in. */
export const PLUGIN_PERMISSIONS = [
  'content:read',
  'content:write',
  'storage',
  'network:request',
  'email:send',
  'settings',
  'admin_menu',
  'rest',
  'assets',
  'widgets',
  'shortcodes',
  'blocks',
  /** Accepted so older manifests still parse. The sandbox does not expose raw SQL. */
  'database',
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
  /** Other plugin ids that must be active first. */
  dependencies?: string[];
  /** Hosts ctx.http.fetch may call when network:request is declared. */
  allowedHosts?: string[];
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
  const hosts = manifest.allowedHosts ?? [];
  if (!Array.isArray(hosts)) throw new Error('allowedHosts must be an array');
  for (const host of hosts) {
    if (typeof host !== 'string' || !/^[a-z0-9.*-]+$/i.test(host) || host.includes('..')) {
      throw new Error(`Invalid allowed host "${host}"`);
    }
  }
  const dependencies = manifest.dependencies ?? [];
  if (!Array.isArray(dependencies)) throw new Error('dependencies must be an array');
  for (const dependency of dependencies) {
    if (typeof dependency !== 'string' || !ID_RE.test(dependency)) {
      throw new Error(`Invalid plugin dependency "${dependency}"`);
    }
  }
  const required = manifest.requires?.openpress;
  if (required && !versionSatisfies(required)) {
    throw new Error(
      `Plugin requires OpenPress ${required}, this core is ${OPENPRESS_VERSION}`,
    );
  }
}
