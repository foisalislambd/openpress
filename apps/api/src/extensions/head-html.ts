/** Tags a plugin may add from the wp_head filter. Scripts and event handlers are removed. */

const META_KEY = /^[a-z][a-z0-9_.:-]{0,40}$/i;

export function sanitizeHeadHtml(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  return items
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 30)
    .map((item) => sanitizeHeadTag(item.slice(0, 2000)))
    .filter(Boolean);
}

export function sanitizeFooterHtml(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  return items
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 30)
    .map((item) => item.replace(/<[^>]+>/g, '').slice(0, 500))
    .filter(Boolean);
}

function sanitizeHeadTag(html: string) {
  const trimmed = html.replace(/\u0000/g, '').trim();
  const meta = /^<meta\s+([^>]+)>$/i.exec(trimmed);
  if (meta) {
    const name = attr(meta[1], 'name') || attr(meta[1], 'property');
    const content = attr(meta[1], 'content');
    if (!name || !META_KEY.test(name) || content == null) return '';
    return `<meta ${attr(meta[1], 'property') ? 'property' : 'name'}="${escapeAttr(name)}" content="${escapeAttr(content.slice(0, 500))}">`;
  }
  const link = /^<link\s+([^>]+)>$/i.exec(trimmed);
  if (link) {
    const rel = attr(link[1], 'rel');
    const href = attr(link[1], 'href');
    if (!rel || !/^[a-z-]{1,40}$/i.test(rel) || !href || !safeHref(href)) return '';
    return `<link rel="${escapeAttr(rel)}" href="${escapeAttr(href)}">`;
  }
  return '';
}

function attr(source: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(source);
  return match ? (match[1] ?? match[2] ?? '') : null;
}

function safeHref(value: string) {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
