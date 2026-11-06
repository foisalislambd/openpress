import { createHmac } from 'crypto';

/** Pure publishing helpers: permalinks, SEO, templates, srcset, diffs, API scopes. */

export interface PermalinkInput {
  slug: string;
  publishedAt?: string | Date | null;
  category?: string | null;
  author?: string | null;
}

const RESERVED_PREFIXES = new Set([
  'admin',
  'api',
  'category',
  'tag',
  'search',
  'feed',
  'uploads',
  'wp-json',
  'sitemap.xml',
  '_next',
]);

export function isPlainPermalink(structure: string | null | undefined) {
  const trimmed = String(structure ?? '').trim();
  return (
    trimmed === '' ||
    trimmed === '/%postname%/' ||
    trimmed === '/%postname%' ||
    trimmed === '/:slug' ||
    trimmed === ':slug'
  );
}

export function buildPermalink(structure: string | null | undefined, input: PermalinkInput) {
  const pattern = isPlainPermalink(structure) ? '/%postname%/' : String(structure);
  const date = input.publishedAt ? new Date(input.publishedAt) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const values: Record<string, string> = {
    '%year%': String(safeDate.getUTCFullYear()),
    '%monthnum%': String(safeDate.getUTCMonth() + 1).padStart(2, '0'),
    '%day%': String(safeDate.getUTCDate()).padStart(2, '0'),
    '%postname%': input.slug,
    '%category%': input.category || 'uncategorized',
    '%author%': input.author || 'author',
  };
  let path = pattern;
  for (const [token, value] of Object.entries(values)) {
    path = path.split(token).join(encodeURIComponent(value));
  }
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  return path;
}

export function permalinkDecision(
  structure: string | null | undefined,
  pathname: string,
  row: {
    slug: string;
    status: string;
    publishedAt?: string | Date | null;
    category?: string | null;
    author?: string | null;
  } | null,
): { action: 'none' } | { action: 'rewrite'; slug: string } | { action: 'redirect'; to: string; statusCode: 301 } {
  if (isPlainPermalink(structure)) return { action: 'none' };
  if (!row || row.status !== 'PUBLISHED') return { action: 'none' };
  const canonical = buildPermalink(structure, {
    slug: row.slug,
    publishedAt: row.publishedAt,
    category: row.category,
    author: row.author,
  });
  const matched = matchPermalink(structure, pathname);
  if (matched?.slug === row.slug && samePath(pathname, canonical)) {
    return { action: 'rewrite', slug: row.slug };
  }
  const slug = pathname.replace(/^\//, '').replace(/\/$/, '');
  if (slug && !slug.includes('/') && slug === row.slug && !samePath(pathname, canonical)) {
    return { action: 'redirect', to: canonical, statusCode: 301 };
  }
  return { action: 'none' };
}

function samePath(left: string, right: string) {
  const normalize = (value: string) => {
    const path = value.startsWith('/') ? value : `/${value}`;
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  };
  return normalize(left) === normalize(right);
}

export function matchPermalink(structure: string | null | undefined, pathname: string) {
  if (isPlainPermalink(structure)) return null;
  const tokens = String(structure)
    .split('/')
    .filter(Boolean);
  if (!tokens.includes('%postname%')) return null;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== tokens.length) return null;
  if (RESERVED_PREFIXES.has(parts[0]?.toLowerCase() ?? '')) return null;
  let slug = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const part = parts[index];
    if (token === '%postname%') slug = safeDecode(part);
    else if (token === '%year%' && !/^\d{4}$/.test(part)) return null;
    else if ((token === '%monthnum%' || token === '%day%') && !/^\d{2}$/.test(part)) return null;
    else if (token.startsWith('%') && token.endsWith('%')) continue;
    else if (token !== part) return null;
  }
  return slug ? { slug } : null;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface SeoInput {
  siteTitle: string;
  siteDescription?: string;
  siteUrl: string;
  blogPublic?: boolean;
  defaultOgImage?: string;
  twitterSite?: string;
  title: string;
  description?: string | null;
  permalink: string;
  type: string;
  coverImage?: string | null;
  publishedAt?: string | Date | null;
  authorName?: string | null;
  seo?: Record<string, unknown> | null;
  alternates?: { locale: string; permalink: string }[];
}

export interface SeoDocument {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: string;
    images?: string[];
    siteName: string;
  };
  twitter: { card: string; site?: string; title: string; description: string; image?: string };
  jsonLd: Record<string, unknown>;
  hreflang: { locale: string; href: string }[];
}

export function buildSeoDocument(input: SeoInput): SeoDocument {
  const seo = input.seo ?? {};
  const title = text(seo.title) || input.title;
  const description = text(seo.description) || input.description || input.siteDescription || '';
  const canonical = absoluteUrl(input.siteUrl, text(seo.canonical) || input.permalink);
  const image = text(seo.ogImage) || input.coverImage || input.defaultOgImage || '';
  const robots = input.blogPublic === false ? 'noindex, nofollow' : text(seo.robots) || 'index, follow';
  const card = text(seo.twitterCard) || (image ? 'summary_large_image' : 'summary');
  const hreflang = (input.alternates ?? []).map((item) => ({
    locale: item.locale,
    href: absoluteUrl(input.siteUrl, item.permalink),
  }));
  const images = image ? [absoluteUrl(input.siteUrl, image)] : undefined;
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': input.type === 'PAGE' ? 'WebPage' : 'Article',
    headline: title,
    description,
    url: canonical,
    mainEntityOfPage: canonical,
    publisher: { '@type': 'Organization', name: input.siteTitle },
  };
  if (input.authorName) jsonLd.author = { '@type': 'Person', name: input.authorName };
  if (input.publishedAt) {
    const date = new Date(input.publishedAt);
    if (!Number.isNaN(date.getTime())) jsonLd.datePublished = date.toISOString();
  }
  if (images?.[0]) jsonLd.image = images[0];
  return {
    title,
    description,
    canonical,
    robots,
    openGraph: {
      title,
      description,
      url: canonical,
      type: input.type === 'PAGE' ? 'website' : 'article',
      images,
      siteName: input.siteTitle,
    },
    twitter: {
      card,
      site: input.twitterSite || undefined,
      title,
      description,
      image: images?.[0],
    },
    jsonLd,
    hreflang,
  };
}

export function absoluteUrl(siteUrl: string, pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = siteUrl.replace(/\/$/, '');
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export interface SrcCandidate {
  url: string;
  width: number;
  formats?: { webp?: { url: string }; avif?: { url: string } };
}

export function buildSrcSet(
  full: { url?: string | null; width?: number | null },
  sizes: Record<string, SrcCandidate> | null | undefined,
  format: 'original' | 'webp' | 'avif' = 'original',
) {
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | undefined, width: number | undefined | null) => {
    if (!url || !width || width < 1 || seen.has(url)) return;
    seen.add(url);
    parts.push(`${url} ${Math.round(width)}w`);
  };
  for (const size of Object.values(sizes ?? {})) {
    if (!size) continue;
    const formatted =
      format === 'webp' ? size.formats?.webp?.url : format === 'avif' ? size.formats?.avif?.url : size.url;
    push(formatted, size.width);
  }
  if (format === 'original') push(full.url ?? undefined, full.width);
  return parts.join(', ');
}

export function templateCandidates(input: {
  kind: 'single' | 'archive' | 'home' | 'search';
  postType?: string | null;
  slug?: string | null;
  taxonomy?: string | null;
  term?: string | null;
}) {
  if (input.kind === 'home') return ['front-page', 'home', 'index'];
  if (input.kind === 'search') return ['search', 'index'];
  if (input.kind === 'archive') {
    const taxonomy = input.taxonomy || 'category';
    return [
      input.term ? `archive-${taxonomy}-${input.term}` : '',
      `archive-${taxonomy}`,
      'archive',
      'index',
    ].filter(Boolean);
  }
  const postType = input.postType || 'post';
  return [
    input.slug ? `single-${postType}-${input.slug}` : '',
    `single-${postType}`,
    postType === 'page' ? 'page' : 'single',
    'index',
  ].filter(Boolean);
}

export type DiffRow = { left: string | null; right: string | null; kind: 'same' | 'del' | 'ins' };

export function diffLines(before: string[], after: string[]): DiffRow[] {
  const n = before.length;
  const m = after.length;
  if (n * m > 250000) {
    return [
      ...before.map((line) => ({ left: line, right: null, kind: 'del' as const })),
      ...after.map((line) => ({ left: null, right: line, kind: 'ins' as const })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      rows.push({ left: before[i], right: after[j], kind: 'same' });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ left: before[i], right: null, kind: 'del' });
      i += 1;
    } else {
      rows.push({ left: null, right: after[j], kind: 'ins' });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ left: before[i], right: null, kind: 'del' });
    i += 1;
  }
  while (j < m) {
    rows.push({ left: null, right: after[j], kind: 'ins' });
    j += 1;
  }
  return rows;
}

export function blocksToLines(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];
  const lines: string[] = [];
  const walk = (list: unknown[]) => {
    for (const block of list) {
      if (!block || typeof block !== 'object') continue;
      const record = block as { content?: unknown; children?: unknown; type?: string; props?: Record<string, unknown> };
      if (record.type === 'image' && record.props?.url) lines.push(`Image: ${String(record.props.url)}`);
      const line = inlineText(record.content);
      if (line) lines.push(line);
      if (Array.isArray(record.children)) walk(record.children);
    }
  };
  walk(blocks);
  return lines;
}

export function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('');
}

export function blocksToHtml(blocks: unknown) {
  return blocksToLines(blocks)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FIELD_TYPES = new Set(['text', 'textarea', 'number', 'url', 'image', 'select', 'boolean']);

export function isFieldType(value: string) {
  return FIELD_TYPES.has(value);
}

export function isMachineSlug(value: string, reserved: string[] = []) {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(value)) return false;
  return !reserved.includes(value);
}

export function sanitizeCss(css: string) {
  return css
    .replace(/@import[^;]+;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\/?[^>]*>?/g, '')
    .slice(0, 20_000);
}

export function isRtlLocale(locale: string) {
  const base = locale.toLowerCase().split('-')[0];
  return base === 'ar' || base === 'he' || base === 'fa' || base === 'ur';
}

const API_SCOPES = ['*', 'content:read', 'content:write', 'media:read', 'media:write', 'mcp'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function normalizeScopes(scopes: unknown): ApiScope[] {
  if (!Array.isArray(scopes)) return [];
  return scopes.filter((scope): scope is ApiScope => API_SCOPES.includes(scope as ApiScope));
}

export function scopeAllows(scopes: string[], method: string, path: string) {
  const normalized = path.split('?')[0];
  if (normalized.startsWith('/api/auth') || normalized.startsWith('/auth')) return false;
  if (scopes.includes('*')) return true;
  const verb = method.toUpperCase();
  const read = verb === 'GET' || verb === 'HEAD';
  const write = verb === 'POST' || verb === 'PUT' || verb === 'PATCH' || verb === 'DELETE';
  const content =
    /\/(content|taxonomy|comments|wp\/v2|graphql)(\/|$)/.test(normalized);
  const media = /\/media(\/|$)/.test(normalized);
  const mcp = /\/(mcp|assistant)(\/|$)/.test(normalized);
  if (mcp && scopes.includes('mcp')) return verb === 'POST' || read;
  if (content && read && scopes.includes('content:read')) return true;
  if (content && write && scopes.includes('content:write')) return true;
  if (normalized.endsWith('/graphql') && scopes.includes('content:read') && verb === 'POST') return true;
  if (media && read && (scopes.includes('media:read') || scopes.includes('content:read'))) return true;
  if (media && write && scopes.includes('media:write')) return true;
  return false;
}

export function signWebhookBody(secret: string, body: string) {
  return createHmac('sha256', secret).update(body).digest('hex');
}
