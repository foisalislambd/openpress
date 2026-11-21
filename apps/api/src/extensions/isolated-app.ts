import { resolve, sep } from 'path';

const FILE_RE = /^[a-z0-9][a-z0-9./_-]{0,120}$/;
const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i;

/** CSP for a plugin bundle. No network, no forms, and only the admin origin may frame it. */
export function isolatedAppCsp(origin: string | undefined) {
  const frame = origin && ORIGIN_RE.test(origin) ? origin : "'none'";
  return `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors ${frame}`;
}

export function isolatedParentOrigin(origin: string | undefined) {
  return origin && ORIGIN_RE.test(origin) ? origin : 'null';
}

export function resolvePluginFile(root: string, relative: string) {
  const file = String(relative || '').replace(/^\/+/, '');
  if (!FILE_RE.test(file) || file.includes('..') || (!file.endsWith('.html') && !file.endsWith('.js'))) {
    throw new Error('Invalid plugin file');
  }
  const base = resolve(root);
  const target = resolve(base, file);
  if (target !== base && !target.startsWith(base + sep)) throw new Error('Invalid plugin file');
  return target;
}

export function bridgeScript(parentOrigin: string | undefined) {
  const origin = isolatedParentOrigin(parentOrigin);
  return `(function(){var parentOrigin=${JSON.stringify(origin)};var pending={};window.addEventListener('message',function(event){if(event.source!==window.parent)return;if(event.origin!==parentOrigin)return;var data=event.data||{};if(data.type==='openpress:result'&&pending[data.id]){var settle=pending[data.id];delete pending[data.id];if(data.ok)settle.resolve(data.data);else settle.reject(new Error(data.error||'Request failed'));}if(data.type==='openpress:block'&&typeof window.onOpenPressBlock==='function'){window.onOpenPressBlock(data.attributes||{});}});window.openpress={call:function(method,path,body){return new Promise(function(resolve,reject){var id=Math.random().toString(36).slice(2);pending[id]={resolve:resolve,reject:reject};window.parent.postMessage({type:'openpress:call',id:id,method:String(method||'GET'),path:String(path||'/'),body:body},parentOrigin);});},setAttributes:function(attributes){window.parent.postMessage({type:'openpress:block-change',attributes:attributes||{}},parentOrigin);}};})();`;
}

export function composeIsolatedDocument(html: string, parentOrigin: string | undefined) {
  const bridge = `<script>${bridgeScript(parentOrigin)}</script>`;
  const source = String(html ?? '');
  if (source.includes('</head>')) return source.replace('</head>', `${bridge}</head>`);
  return `${bridge}${source}`;
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function readBridgeCall(data: unknown) {
  if (!data || typeof data !== 'object') return null;
  const record = data as { type?: unknown; id?: unknown; method?: unknown; path?: unknown; body?: unknown };
  if (record.type !== 'openpress:call') return null;
  const id = typeof record.id === 'string' ? record.id.slice(0, 40) : '';
  const method = typeof record.method === 'string' ? record.method.toUpperCase() : '';
  const path = typeof record.path === 'string' ? record.path : '';
  if (!id || !METHODS.has(method) || !isPluginPath(path)) return null;
  return { id, method, path, body: record.body };
}

export function isPluginPath(path: string) {
  if (!path.startsWith('/') || path.length > 200) return false;
  if (path.includes('..') || path.includes('\\') || path.includes('//') || path.includes('?') || path.includes('#')) return false;
  return /^\/[a-zA-Z0-9/_-]*$/.test(path);
}

export function readBlockChange(data: unknown, keys: string[]) {
  if (!data || typeof data !== 'object') return null;
  const record = data as { type?: unknown; attributes?: unknown };
  if (record.type !== 'openpress:block-change' || !record.attributes || typeof record.attributes !== 'object') return null;
  const source = record.attributes as Record<string, unknown>;
  const next: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (typeof value === 'string') next[key] = value.slice(0, 5000);
    else if (typeof value === 'boolean') next[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  return next;
}
