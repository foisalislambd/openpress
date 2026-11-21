/**
 * Public contract for an OpenPress server plugin.
 * The API enforces permissions inside the sandbox. This package types that contract.
 * Plugins do not get a database connection or the filesystem outside their directory.
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
  'data',
  'cron',
  'users:read',
  'users:write',
  'comments',
  'media',
  'modeling',
  'i18n',
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
  /** Other plugin ids that must already be active. */
  dependencies?: string[];
  /** Hosts `ctx.http.fetch` may call when `network:request` is declared. */
  allowedHosts?: string[];
  /** Delete this plugin's collections and storage when the plugin is deleted. */
  removeData?: boolean;
}

export type FieldType = 'string' | 'text' | 'number' | 'boolean';

export interface CollectionField {
  type: FieldType;
  required?: boolean;
  max?: number;
  values?: string[];
}

export interface CollectionSchema {
  name: string;
  fields: Record<string, CollectionField>;
}

export interface CollectionQuery {
  where?: Record<string, unknown>;
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

export interface PluginRecord {
  id: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface PluginContent {
  id: string;
  type: string;
  postType?: string;
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

export interface AdminField {
  key: string;
  label: string;
  type?: 'text' | 'textarea';
}

export interface BlockAttribute {
  key: string;
  type?: 'string' | 'number' | 'boolean';
  label?: string;
}

/**
 * Actions and filters core actually fires.
 * A plugin may also fire its own hooks with doAction and applyFilters.
 */
export const CORE_HOOKS = {
  actions: [
    'init',
    'plugins_loaded',
    'plugin.activated',
    'plugin.deactivated',
    'plugin.uninstalled',
    'content.created',
    'content.updated',
    'content.published',
    'content.deleted',
    'save_post',
    'delete_post',
    'comment.created',
    'comment.status_changed',
    'settings.updated',
    'user_register',
    'wp_login',
    'wp_login_failed',
    'wp_logout',
    'template_redirect',
  ],
  filters: [
    'content.blocks',
    'content.public',
    'content.query',
    'the_title',
    'the_excerpt',
    'the_content',
    'pre_get_posts',
    'document_title',
    'template_include',
    'wp_head',
    'wp_footer',
    'authenticate',
    'user_has_cap',
    'wp_mail',
    'comment_text',
    'rest_post_dispatch',
    'graphql_response',
    'assistant.complete',
  ],
} as const;

export interface PluginContext {
  manifest: PluginManifest;
  logger: PluginLogger;
  hooks: PluginHooks;
  /** Always throws. Raw SQL is not available in the sandbox. */
  readonly db: never;
  content: {
    list: (query?: { search?: string }) => Promise<PluginContent[]>;
    get: (id: string) => Promise<PluginContent | null>;
    query: (query?: { type?: 'POST' | 'PAGE'; postType?: string; status?: string; search?: string; limit?: number }) => Promise<PluginContent[]>;
    create: (input: { title: string; type?: 'POST' | 'PAGE'; postType?: string; excerpt?: string }) => Promise<{ id: string; slug: string; status: 'DRAFT'; postType?: string }>;
    update: (id: string, input: { title?: string; excerpt?: string; status?: 'DRAFT' | 'PUBLISHED' }) => Promise<{ id: string; updated: boolean }>;
    meta: {
      get: (id: string, key: string) => Promise<unknown>;
      set: (id: string, key: string, value: unknown) => Promise<unknown>;
      delete: (id: string, key: string) => Promise<unknown>;
    };
    types: { register: (def: { slug: string; label: string; singular?: string; public?: boolean; hierarchical?: boolean; supports?: string[] }) => Promise<unknown> };
    taxonomies: { register: (def: { slug: string; label: string; singular?: string; hierarchical?: boolean; postTypes?: string[] }) => Promise<unknown> };
    terms: {
      list: (taxonomy: string) => Promise<unknown>;
      create: (input: { taxonomy: string; name: string; slug?: string; description?: string }) => Promise<unknown>;
      set: (contentId: string, termIds: string[]) => Promise<unknown>;
    };
  };
  data: {
    define: (schema: CollectionSchema) => void;
    insert: (name: string, values: Record<string, unknown>) => Promise<PluginRecord>;
    find: (name: string, query?: CollectionQuery) => Promise<PluginRecord[]>;
    get: (name: string, id: string) => Promise<PluginRecord | null>;
    update: (name: string, id: string, values: Record<string, unknown>) => Promise<PluginRecord>;
    remove: (name: string, id: string) => Promise<{ deleted: boolean }>;
    count: (name: string, query?: CollectionQuery) => Promise<{ count: number }>;
  };
  migrations: { add: (version: string, run: () => unknown) => void };
  lifecycle: {
    onInstall: (fn: () => unknown) => void;
    onDeactivate: (fn: () => unknown) => void;
    onUninstall: (fn: () => unknown) => void;
  };
  storage: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<unknown>;
    delete: (key: string) => Promise<unknown>;
  };
  transients?: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown, ttlSeconds?: number) => Promise<unknown>;
    delete: (key: string) => Promise<unknown>;
  };
  settings: {
    get: () => Promise<Record<string, unknown>>;
    set: (values: Record<string, unknown>) => Promise<unknown>;
    register?: (def: { key: string; type?: 'string' | 'number' | 'boolean' | 'json'; label?: string; group?: string; autoload?: boolean }) => void;
  };
  capabilities?: { register: (cap: { name: string; label?: string }) => void };
  users: {
    list: (query?: { search?: string }) => Promise<{ id: string; email: string; name: string; role: string }[]>;
    get: (id: string) => Promise<{ id: string; email: string; name: string; role: string } | null>;
    /** Grants a capability this plugin registered. Core administrator capabilities are refused. */
    grant: (userId: string, capability: string) => Promise<unknown>;
  };
  comments: {
    list: (query?: { contentId?: string; status?: string }) => Promise<unknown>;
    create: (input: { contentId: string; body: string; name?: string; email?: string }) => Promise<unknown>;
    moderate: (input: { id: string; status: 'PENDING' | 'APPROVED' | 'SPAM' | 'TRASHED' }) => Promise<unknown>;
  };
  media: { list: (query?: { limit?: number }) => Promise<unknown> };
  cron: {
    /** Fires `pluginId.hook` on the schedule. Listen with addAction on the returned hook. */
    schedule: (input: { hook: string; intervalSeconds?: number | null; args?: unknown[] }) => Promise<{ hook: string; id: string }>;
    unschedule: (hook: string) => Promise<unknown>;
  };
  i18n: {
    t: (message: string, locale?: string) => Promise<string>;
    load: (pack: { locale: string; messages: Record<string, string> }) => Promise<unknown>;
  };
  rewrite?: { add: (rule: { pattern: string; query?: Record<string, string>; priority?: number }) => void };
  http: { fetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }> };
  email: { send: (message: { to: string; subject: string; text: string }) => Promise<unknown> };
  admin: {
    addMenuPage: (page: {
      slug: string;
      title: string;
      menuTitle?: string;
      fields?: AdminField[];
      screen?: 'form' | 'list' | 'content' | 'html';
      collection?: string;
      postType?: string;
      columns?: { key: string; label: string }[];
      html?: string;
    }) => void;
    addMetaBox: (box: { id: string; title: string; postTypes?: string[]; fields: AdminField[] }) => void;
    addDashboardWidget: (widget: { id: string; title: string; render?: () => unknown }) => void;
    notice: (notice: { type?: 'info' | 'success' | 'warning' | 'error'; message: string }) => void;
  };
  widgets: { register: (widget: { id: string; name: string; render?: (instance: Record<string, unknown>) => unknown }) => void };
  shortcodes: { add: (tag: string, render: (attrs: Record<string, string>) => unknown) => void };
  forms: {
    register: (form: { id: string; title?: string; fields: AdminField[]; onSubmit: (values: Record<string, string>) => unknown }) => void;
  };
  blocks: {
    register: (block: {
      name: string;
      title: string;
      description?: string;
      attributes?: BlockAttribute[];
      render?: (props: Record<string, unknown>) => unknown;
    }) => void;
  };
  rest: { route: (method: string, path: string, handler: (req: { query: Record<string, string>; body: unknown }) => unknown) => void };
  assets: {
    enqueueStyle: (handle: string, file: string) => void;
    enqueueScript: (handle: string, file: string) => void;
  };
}

export function definePlugin(activate: (ctx: PluginContext) => void | Promise<void>) {
  return { activate };
}
