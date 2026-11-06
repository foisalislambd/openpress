/**
 * Rewrite registry. Patterns are full regular expressions anchored by the author.
 * Matching is conflict-aware: two rules that accept the same probe path are a conflict.
 * Paths under the admin, API, and framework prefixes are rejected.
 */

export interface RewriteRule {
  id: string;
  pattern: string;
  query: Record<string, string>;
  source: string;
  priority: number;
}

export interface RewriteMatch {
  id: string;
  query: Record<string, string>;
  rewriteTo: string | null;
}

const UNSAFE = /(\(\?[<!=])|\\[1-9]|[\r\n]/;
const PROBES = [
  '/hello-world',
  '/2026/01/hello-world',
  '/2026/01/02/hello-world',
  '/news/hello-world',
  '/author/hello-world',
  '/category/news',
  '/tag/launch',
  '/search',
  '/feed',
  '/admin',
  '/api/health',
  '/wp-json/wp/v2/posts',
  '/_next/static/chunk.js',
];

export function compileRewrite(pattern: string): RegExp | null {
  if (!pattern || pattern.length > 180 || UNSAFE.test(pattern)) return null;
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export function structureRule(structure: string | null | undefined): RewriteRule | null {
  const tokens = String(structure ?? '')
    .split('/')
    .filter(Boolean);
  if (!tokens.includes('%postname%')) return null;
  if (tokens.length === 1 && tokens[0] === '%postname%') return null;
  const parts = tokens.map((token) => {
    if (token === '%postname%' || token === '%category%' || token === '%author%') return '([^/]+)';
    if (token === '%year%') return '(\\d{4})';
    if (token === '%monthnum%' || token === '%day%') return '(\\d{2})';
    if (!/^[a-z0-9_-]+$/i.test(token)) return null;
    return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  if (parts.some((part) => part === null)) return null;
  return {
    id: 'core:permalink',
    pattern: `^/${parts.join('/')}/?$`,
    query: { kind: 'permalink' },
    source: 'core',
    priority: 5,
  };
}

export function matchRewrite(path: string, rules: RewriteRule[]): RewriteMatch | null {
  const pathname = path.startsWith('/') ? path : `/${path}`;
  if (pathname.includes('..') || reserved(pathname)) return null;
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const rule of ordered) {
    const regex = compileRewrite(rule.pattern);
    if (!regex) continue;
    const match = regex.exec(pathname);
    if (!match) continue;
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(rule.query)) {
      query[key] = value.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? '');
    }
    return { id: rule.id, query, rewriteTo: safeInternal(query.rewriteTo) };
  }
  return null;
}

export function findConflicts(rules: RewriteRule[], extra: RewriteRule[] = []) {
  const all = [...rules, ...extra].filter((rule) => compileRewrite(rule.pattern));
  const conflicts: { path: string; rules: string[] }[] = [];
  const probes = new Set<string>(PROBES);
  for (const rule of all) {
    const probe = probeFor(rule.pattern);
    if (probe) probes.add(probe);
  }
  for (const path of probes) {
    const hits = all.filter((rule) => compileRewrite(rule.pattern)?.test(path));
    if (hits.length > 1) conflicts.push({ path, rules: hits.map((rule) => rule.id) });
  }
  const reservedHits = all.filter((rule) =>
    ['/admin', '/api/health', '/wp-json/wp/v2/posts', '/_next/static/chunk.js'].some((path) =>
      compileRewrite(rule.pattern)?.test(path),
    ),
  );
  for (const rule of reservedHits) {
    conflicts.push({ path: 'reserved', rules: [rule.id] });
  }
  return conflicts;
}

export function ruleTouchesReserved(pattern: string) {
  const regex = compileRewrite(pattern);
  if (!regex) return true;
  return ['/admin', '/api/health', '/wp-json/wp/v2/posts', '/_next/static/chunk.js'].some((path) => regex.test(path));
}

function probeFor(pattern: string) {
  let probe = pattern.replace(/^\^/, '').replace(/\$$/, '');
  probe = probe.replace(/\\\//g, '/');
  probe = probe.replace(/\(\?:[^)]*\)/g, 'x');
  probe = probe.replace(/\\d\{4\}/g, '2026').replace(/\(\\d\{4\}\)/g, '2026');
  probe = probe.replace(/\\d\{2\}/g, '01').replace(/\(\\d\{2\}\)/g, '01');
  probe = probe.replace(/\(\[\^\/\]\+\)/g, 'hello').replace(/\[\^\/\]\+/g, 'hello');
  probe = probe.replace(/\(\.\+\)/g, 'hello').replace(/\.\+/g, 'hello');
  probe = probe.replace(/\(\?:\/\)\?/g, '').replace(/\/\?/g, '');
  if (!probe.startsWith('/')) probe = `/${probe}`;
  if (probe.includes('(') || probe.includes('\\')) return null;
  return probe.replace(/\/{2,}/g, '/');
}

function reserved(pathname: string) {
  return /^\/(admin|api|wp-json|_next)(\/|$)/.test(pathname);
}

function safeInternal(value: string | undefined) {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('..') || value.includes('://')) return null;
  if (reserved(value)) return null;
  return value;
}
