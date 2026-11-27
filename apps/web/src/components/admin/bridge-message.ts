const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function readBridgeCall(data: unknown) {
  if (!data || typeof data !== 'object') return null;
  const record = data as { type?: unknown; id?: unknown; method?: unknown; path?: unknown; body?: unknown };
  if (record.type !== 'openpress:call') return null;
  const id = typeof record.id === 'string' ? record.id.slice(0, 40) : '';
  const method = typeof record.method === 'string' ? record.method.toUpperCase() : '';
  const path = typeof record.path === 'string' ? record.path : '';
  if (!id || !METHODS.has(method) || !path.startsWith('/') || path.includes('..') || path.includes('?')) return null;
  return { id, method, path, body: record.body };
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
