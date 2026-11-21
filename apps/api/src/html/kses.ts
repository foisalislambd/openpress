/** Small allow-list for comments and text widgets. Not a browser HTML parser. */

const ALLOWED = new Set(['a', 'p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'code']);

export function kses(html: string) {
  const stripped = html
    .replace(/\u0000/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*\/?\s*>/gi, '');
  return stripped.replace(/<\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, (full, rawName: string, attrs: string) => {
    const tag = rawName.toLowerCase();
    if (!ALLOWED.has(tag)) return '';
    if (full.trim().startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag !== 'a') return `<${tag}>`;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const url = safeHref(decodeHref(href?.[1] ?? href?.[2] ?? href?.[3] ?? ''));
    return url ? `<a href="${escapeAttr(url)}">` : '<a>';
  });
}

export function safeHref(value: string) {
  const url = value.trim();
  if (!url || url.length > 2000) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (url.startsWith('#') || url.startsWith('?')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') return url;
  } catch {
    return null;
  }
  return null;
}

function decodeHref(value: string) {
  return value
    .replace(/&#x([0-9a-f]{1,6});?/gi, (match, hex: string) => fromCode(Number.parseInt(hex, 16), match))
    .replace(/&#(\d{1,7});?/g, (match, dec: string) => fromCode(Number(dec), match))
    .replace(/[\u0000-\u001F\u007F]/g, '');
}

function fromCode(code: number, fallback: string) {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return fallback;
  return String.fromCodePoint(code);
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
