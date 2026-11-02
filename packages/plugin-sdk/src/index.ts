/**
 * Public contract for an OpenPress server plugin.
 * The API enforces permissions. This package only types that contract.
 */

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
  /** `*`, exact `x.y.z`, `>=x.y.z`, or `^x.y.z`. */
  requires?: { openpress?: string };
  permissions?: PluginPermission[];
  /** Hosts `ctx.http.fetch` may call when `network:request` is declared. */
  allowedHosts?: string[];
}

export interface PluginContent {
  id: string;
  type: string;
  status: string;
  visibility: string;
  title: string;
  slug: string;
  excerpt: string | null;
}

export interface PluginLogger {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

type HookArgs = unknown[];

export interface PluginHooks {
  addAction: (event: string, fn: (...args: HookArgs) => unknown, priority?: number) => void;
  on: (event: string, fn: (...args: HookArgs) => unknown) => void;
  addFilter: <T>(hook: string, fn: (value: T, ...args: HookArgs) => T | Promise<T>, priority?: number) => void;
  doAction: (event: string, ...args: unknown[]) => Promise<unknown>;
  applyFilters: <T>(hook: string, value: T, ...args: unknown[]) => Promise<T>;
}

export interface PluginContext {
  manifest: PluginManifest;
  logger: PluginLogger;
  hooks: PluginHooks;
  /** Always throws. Raw SQL is not available in the sandbox. */
  readonly db: never;
  content: {
    list: (query?: { search?: string }) => Promise<PluginContent[]>;
    get: (id: string) => Promise<PluginContent | null>;
    create: (input: { title: string; type?: 'POST' | 'PAGE'; excerpt?: string }) => Promise<{ id: string; slug: string; status: 'DRAFT' }>;
    update: (id: string, input: { title?: string; excerpt?: string; status?: 'DRAFT' | 'PUBLISHED' }) => Promise<{ id: string; updated: boolean }>;
  };
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<unknown>;
    delete: (key: string) => Promise<unknown>;
  };
  settings: {
    get: () => Promise<Record<string, unknown>>;
    set: (values: Record<string, unknown>) => Promise<unknown>;
  };
  http: {
    fetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }>;
  };
  email: {
    send: (message: { to: string; subject: string; text: string }) => Promise<unknown>;
  };
  admin: {
    addMenuPage: (page: { slug: string; title: string; menuTitle?: string; fields?: { key: string; label: string; type?: string }[] }) => void;
  };
  widgets: {
    register: (widget: { id: string; name: string; render?: (instance: Record<string, unknown>) => unknown }) => void;
  };
  shortcodes: {
    add: (tag: string, render: (attrs: Record<string, string>) => unknown) => void;
  };
  blocks: {
    register: (block: { name: string; title: string; description?: string }) => void;
  };
  rest: {
    route: (method: string, path: string, handler: (req: unknown) => unknown) => void;
  };
  assets: {
    enqueueStyle: (handle: string, file: string) => void;
    enqueueScript: (handle: string, file: string) => void;
  };
}

export function definePlugin(activate: (ctx: PluginContext) => void | Promise<void>) {
  return { activate };
}
