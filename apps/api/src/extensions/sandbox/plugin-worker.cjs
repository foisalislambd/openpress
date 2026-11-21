/**
 * Plugin process. Started with Node's permission model so filesystem access
 * outside the plugin directory is denied. Network builtins are sealed here
 * because Node 22 does not enforce the "net" permission on http.get.
 * The parent is the only path to content, storage, email, and HTTP.
 */
const Module = require('module');
const path = require('path');
const { registerHooks } = require('node:module');

const BLOCKED = new Set([
  'fs',
  'fs/promises',
  'http',
  'https',
  'net',
  'tls',
  'dgram',
  'dns',
  'child_process',
  'cluster',
  'worker_threads',
  'vm',
  'inspector',
  'module',
  'repl',
]);

function blocked(id) {
  const name = String(id).replace(/^node:/, '');
  return BLOCKED.has(name) || name.startsWith('fs/') || name.startsWith('node:fs');
}

const originalLoad = Module._load;
Module._load = function sandboxLoad(request) {
  if (blocked(request)) {
    throw new Error(`Sandbox blocked require("${request}")`);
  }
  return originalLoad.apply(this, arguments);
};
const originalRequire = Module.prototype.require;
Module.prototype.require = function sandboxRequire(id) {
  if (blocked(id)) {
    throw new Error(`Sandbox blocked require("${id}")`);
  }
  return originalRequire.apply(this, arguments);
};

registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('node:') && blocked(url.slice('node:'.length))) {
      throw new Error(`Sandbox blocked import("${url}")`);
    }
    return nextLoad(url, context);
  },
});

for (const name of ['binding', 'dlopen', '_linkedBinding']) {
  if (typeof process[name] === 'function') {
    process[name] = () => {
      throw new Error(`Sandbox blocked process.${name}`);
    };
  }
}

if (typeof process.getBuiltinModule === 'function') {
  const builtin = process.getBuiltinModule.bind(process);
  process.getBuiltinModule = (id) => {
    if (blocked(id)) throw new Error(`Sandbox blocked builtin "${id}"`);
    return builtin(id);
  };
}

globalThis.fetch = () => {
  throw new Error('Sandbox blocked fetch. Declare network:request and call ctx.http.fetch.');
};

const pluginDir = process.env.OPENPRESS_PLUGIN_DIR;
const mainFile = process.env.OPENPRESS_PLUGIN_MAIN;
const manifest = JSON.parse(process.env.OPENPRESS_PLUGIN_MANIFEST || '{}');
const permissions = new Set(manifest.permissions || []);

const pending = new Map();
let seq = 0;
const handlers = new Map();
const registrations = [];

function rpc(method, args) {
  const id = `rpc-${++seq}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    process.send({ type: 'rpc', id, method, args });
  });
}

function allow(permission) {
  if (!permissions.has(permission)) {
    throw new Error(`Plugin "${manifest.id}" has not declared the "${permission}" permission`);
  }
}

function track(kind, meta, fn) {
  const id = `${kind}-${registrations.length + 1}`;
  if (fn) handlers.set(id, fn);
  registrations.push({ id, kind, ...meta });
  return id;
}

process.on('message', async (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'rpc-result') {
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.ok) waiter.resolve(msg.result);
    else waiter.reject(new Error(msg.error || 'Plugin call failed'));
    return;
  }
  if (msg.type === 'invoke') {
    const handler = handlers.get(msg.hookId);
    try {
      const result = handler ? await handler(...(msg.args || [])) : null;
      process.send({ type: 'invoke-result', callId: msg.callId, ok: true, result });
    } catch (error) {
      process.send({
        type: 'invoke-result',
        callId: msg.callId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

const ctx = {
  manifest,
  logger: {
    log: (message) => process.send({ type: 'log', level: 'log', message: String(message) }),
    warn: (message) => process.send({ type: 'log', level: 'warn', message: String(message) }),
    error: (message) => process.send({ type: 'log', level: 'error', message: String(message) }),
  },
  hooks: {
    addAction: (event, fn, priority = 10) => track('action', { event, priority }, fn),
    on: (event, fn) => track('action', { event, priority: 10 }, fn),
    addFilter: (hook, fn, priority = 10) => track('filter', { event: hook, priority }, fn),
    doAction: (event, ...args) => rpc('hooks.doAction', [event, args]),
    applyFilters: (hook, value, ...args) => rpc('hooks.applyFilters', [hook, value, args]),
  },
  get db() {
    throw new Error('Raw SQL is not available in the plugin sandbox. Use ctx.content and ctx.storage.');
  },
  content: {
    list: (query) => {
      allow('content:read');
      return rpc('content.list', [query || {}]);
    },
    get: (id) => {
      allow('content:read');
      return rpc('content.get', [id]);
    },
    query: (query) => {
      allow('content:read');
      return rpc('content.query', [query || {}]);
    },
    create: (input) => {
      allow('content:write');
      return rpc('content.create', [input || {}]);
    },
    update: (id, input) => {
      allow('content:write');
      return rpc('content.update', [id, input || {}]);
    },
    meta: {
      get: (id, key) => {
        allow('content:read');
        return rpc('content.meta', [id, key]);
      },
      set: (id, key, value) => {
        allow('content:write');
        return rpc('content.meta', [id, key, value]);
      },
      delete: (id, key) => {
        allow('content:write');
        return rpc('content.meta', [id, key, null]);
      },
    },
    types: {
      register: (def) => {
        allow('modeling');
        return rpc('content.types', [def || {}]);
      },
    },
    taxonomies: {
      register: (def) => {
        allow('modeling');
        return rpc('content.taxonomies', [def || {}]);
      },
    },
    terms: {
      list: (taxonomy) => {
        allow('content:read');
        return rpc('content.terms', ['list', { taxonomy }]);
      },
      create: (input) => {
        allow('content:write');
        return rpc('content.terms', ['create', input || {}]);
      },
      set: (contentId, termIds) => {
        allow('content:write');
        return rpc('content.terms', ['set', { contentId, termIds }]);
      },
    },
  },
  data: {
    define: (schema) => {
      allow('data');
      track('collection', { name: schema && schema.name, schema });
      return rpc('data.define', [schema]);
    },
    insert: (name, values) => {
      allow('data');
      return rpc('data.insert', [name, values || {}]);
    },
    find: (name, query) => {
      allow('data');
      return rpc('data.find', [name, query || {}]);
    },
    get: (name, id) => {
      allow('data');
      return rpc('data.get', [name, id]);
    },
    update: (name, id, values) => {
      allow('data');
      return rpc('data.update', [name, id, values || {}]);
    },
    remove: (name, id) => {
      allow('data');
      return rpc('data.remove', [name, id]);
    },
    count: (name, query) => {
      allow('data');
      return rpc('data.count', [name, query || {}]);
    },
  },
  migrations: {
    add: (version, fn) => {
      allow('data');
      track('migration', { version: String(version || '') }, fn);
    },
  },
  lifecycle: {
    onInstall: (fn) => track('lifecycle', { event: 'install' }, fn),
    onDeactivate: (fn) => track('lifecycle', { event: 'deactivate' }, fn),
    onUninstall: (fn) => track('lifecycle', { event: 'uninstall' }, fn),
  },
  users: {
    list: (query) => {
      allow('users:read');
      return rpc('users.list', [query || {}]);
    },
    get: (id) => {
      allow('users:read');
      return rpc('users.get', [id]);
    },
    grant: (userId, capability) => {
      allow('users:write');
      return rpc('users.grant', [userId, capability]);
    },
  },
  comments: {
    list: (query) => {
      allow('comments');
      return rpc('comments.list', [query || {}]);
    },
    create: (input) => {
      allow('comments');
      return rpc('comments.create', [input || {}]);
    },
    moderate: (input) => {
      allow('comments');
      return rpc('comments.moderate', [input || {}]);
    },
  },
  media: {
    list: (query) => {
      allow('media');
      return rpc('media.list', [query || {}]);
    },
  },
  cron: {
    schedule: (input) => {
      allow('cron');
      return rpc('cron.schedule', [input || {}]);
    },
    unschedule: (hook) => {
      allow('cron');
      return rpc('cron.unschedule', [hook]);
    },
  },
  i18n: {
    t: (message, locale) => {
      allow('i18n');
      return rpc('i18n.t', [{ message, locale }]);
    },
    load: (pack) => {
      allow('i18n');
      return rpc('i18n.load', [pack || {}]);
    },
  },
  storage: {
    get: (key) => {
      allow('storage');
      return rpc('storage.get', [key]);
    },
    set: (key, value) => {
      allow('storage');
      return rpc('storage.set', [key, value]);
    },
    delete: (key) => {
      allow('storage');
      return rpc('storage.delete', [key]);
    },
  },
  settings: {
    get: () => {
      allow('settings');
      return rpc('settings.get', []);
    },
    set: (values) => {
      allow('settings');
      return rpc('settings.set', [values || {}]);
    },
    register: (def) => {
      allow('settings');
      track('setting', {
        optionKey: String(def.key || ''),
        optionType: String(def.type || 'string'),
        title: String(def.label || def.key || ''),
        optionGroup: String(def.group || 'plugin'),
        optionAutoload: def.autoload !== false,
      });
    },
  },
  transients: {
    get: (key) => {
      allow('settings');
      return rpc('transient.get', [String(key || '')]);
    },
    set: (key, value, ttlSeconds) => {
      allow('settings');
      return rpc('transient.set', [String(key || ''), value, ttlSeconds]);
    },
    delete: (key) => {
      allow('settings');
      return rpc('transient.delete', [String(key || '')]);
    },
  },
  capabilities: {
    register: (cap) => {
      allow('settings');
      track('capability', { name: String(cap.name || ''), title: String(cap.label || cap.name || '') });
    },
  },
  rewrite: {
    add: (rule) => {
      allow('rest');
      track('rewrite', {
        pattern: String(rule.pattern || ''),
        query: rule.query && typeof rule.query === 'object' ? rule.query : {},
        priority: Number(rule.priority ?? 20),
      });
    },
  },
  http: {
    fetch: (url, init) => {
      allow('network:request');
      return rpc('http.fetch', [String(url), init || {}]);
    },
  },
  email: {
    send: (message) => {
      allow('email:send');
      return rpc('email.send', [message || {}]);
    },
  },
  admin: {
    addMenuPage: (page) => {
      allow('admin_menu');
      track('page', {
        slug: page.slug,
        title: page.title,
        menuTitle: page.menuTitle || page.title,
        fields: page.fields || [],
        screen: page.screen || 'form',
        collection: page.collection,
        postType: page.postType,
        columns: page.columns || [],
        html: typeof page.html === 'string' ? page.html.slice(0, 20000) : '',
        entry: typeof page.entry === 'string' ? page.entry.slice(0, 120) : '',
      });
    },
    addMetaBox: (box) => {
      allow('admin_menu');
      track('metabox', {
        widgetId: box.id,
        title: box.title,
        postTypes: box.postTypes || ['post'],
        fields: box.fields || [],
      });
    },
    addDashboardWidget: (widget) => {
      allow('admin_menu');
      track('dashboard', { widgetId: widget.id, title: widget.title }, widget.render);
    },
    notice: (notice) => {
      allow('admin_menu');
      track('notice', { noticeType: notice.type || 'info', message: String(notice.message || '').slice(0, 300) });
    },
  },
  widgets: {
    register: (widget) => {
      allow('widgets');
      track('widget', { widgetId: widget.id, name: widget.name }, widget.render);
    },
  },
  shortcodes: {
    add: (tag, render) => {
      allow('shortcodes');
      track('shortcode', { tag }, render);
    },
  },
  forms: {
    register: (form) => {
      allow('rest');
      track('form', { widgetId: form.id, title: form.title || form.id, fields: form.fields || [] }, form.onSubmit);
    },
  },
  blocks: {
    register: (block) => {
      allow('blocks');
      track(
        'block',
        {
          name: block.name,
          title: block.title,
          description: block.description,
          attributes: Array.isArray(block.attributes) ? block.attributes.slice(0, 12) : [],
          editor: typeof block.editor === 'string' ? block.editor.slice(0, 120) : '',
        },
        block.render,
      );
    },
  },
  rest: {
    route: (method, routePath, handler, options) => {
      allow('rest');
      const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;
      track('rest', { method, path: normalized, auth: Boolean(options && options.auth) }, handler);
    },
  },
  graphql: {
    type: (definition) => {
      allow('graphql');
      track('graphql-type', { sdl: String(definition || '').slice(0, 2000) });
    },
    query: (name, returns, fn) => {
      allow('graphql');
      track('graphql-field', { role: 'query', name: String(name || ''), returns: String(returns || '') }, fn);
    },
    mutation: (name, args, returns, fn) => {
      allow('graphql');
      track('graphql-field', {
        role: 'mutation',
        name: String(name || ''),
        args: String(args || ''),
        returns: String(returns || ''),
      }, fn);
    },
  },
  assets: {
    enqueueStyle: (handle, file) => {
      allow('assets');
      track('asset', { handle, file, assetKind: 'style' });
    },
    enqueueScript: (handle, file) => {
      allow('assets');
      track('asset', { handle, file, assetKind: 'script' });
    },
  },
};

async function main() {
  const mainPath = path.resolve(pluginDir, mainFile);
  if (!mainPath.startsWith(path.resolve(pluginDir))) {
    throw new Error('Plugin main path escapes the plugin directory');
  }
  const loaded = originalRequire(mainPath);
  const activate = loaded.activate || loaded.default?.activate;
  if (typeof activate !== 'function') {
    throw new Error('Plugin does not export activate()');
  }
  await activate(ctx);
  process.send({ type: 'ready', registrations });
}

main().catch((error) => {
  process.send({
    type: 'ready',
    registrations: [],
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
