/**
 * Production-safe theme templates.
 * Static markup is the theme. {{values}} are escaped. There is no code execution.
 * {{yield}} is left in place so the host can insert rendered content.
 */

const BLOCKED = /<\s*\/?\s*(script|iframe|object|embed|svg|math|link|meta)\b|javascript\s*:|on[a-z]+\s*=/i;

export interface ThemeTemplateData {
  [key: string]: ThemeTemplateValue;
}

type ThemeTemplateValue = string | number | boolean | null | undefined | ThemeTemplateData | ThemeTemplateData[];

export function renderThemeTemplate(source: string, data: ThemeTemplateData = {}) {
  const rendered = renderPart(String(source ?? ''), data);
  return sanitizeThemeHtml(rendered);
}

export function sanitizeThemeHtml(html: string) {
  return String(html ?? '')
    .replace(/\u0000/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export function splitYield(html: string) {
  const index = html.indexOf('{{yield}}');
  if (index < 0) return { before: html, after: '' };
  return { before: html.slice(0, index), after: html.slice(index + '{{yield}}'.length) };
}

function renderPart(source: string, data: ThemeTemplateData): string {
  const pattern = /\{\{\s*(#|\/|>)?\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*\}\}/g;
  let cursor = 0;
  let html = '';
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    // A section moves the cursor past its closing tag. Later matches inside that
    // section belong to the section, so the outer scan skips them.
    if (index < cursor) continue;
    html += source.slice(cursor, index);
    const sigil = match[1] ?? '';
    const key = match[2];
    if (sigil === '#') {
      const close = source.indexOf(`{{/${key}}}`, index);
      if (close < 0) {
        cursor = index + match[0].length;
        continue;
      }
      const inner = source.slice(index + match[0].length, close);
      const value = lookup(data, key);
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && !Array.isArray(item)) html += renderPart(inner, item as ThemeTemplateData);
        }
      }
      cursor = close + `{{/${key}}}`.length;
      continue;
    }
    if (sigil === '/' || sigil === '>') {
      cursor = index + match[0].length;
      continue;
    }
    if (key === 'yield') {
      html += '{{yield}}';
    } else {
      html += escapeHtml(display(lookup(data, key)));
    }
    cursor = index + match[0].length;
  }
  html += source.slice(cursor);
  return html;
}

function lookup(data: ThemeTemplateData, path: string): ThemeTemplateValue {
  let current: ThemeTemplateValue = data;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return '';
    current = current[part];
  }
  return current;
}

function display(value: ThemeTemplateValue) {
  if (value == null || typeof value === 'object') return '';
  return String(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function themeTemplateHasActiveContent(source: string) {
  return BLOCKED.test(source);
}
