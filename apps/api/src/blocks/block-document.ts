/**
 * Server-side block document model.
 * This is the foundation for a later editor: documents are validated and
 * serialized here, not trusted as opaque JSON from the browser.
 * It understands the BlockNote-shaped trees OpenPress already stores.
 */

const CORE_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
  'toggleListItem',
  'quote',
  'codeBlock',
  'image',
  'video',
  'audio',
  'file',
  'table',
  'separator',
  'spacer',
  'group',
  'columns',
  'column',
  'buttons',
  'button',
  'embed',
  'reusable',
  'pullquote',
  'verse',
  'pluginBlock',
]);

const MAX_NODES = 2000;
const MAX_DEPTH = 12;
const MAX_INLINE = 8;

export interface BlockNode {
  id?: string;
  type: string;
  props?: Record<string, string | number | boolean>;
  content?: unknown;
  children?: BlockNode[];
}

export type BlockValidation =
  | { ok: true; blocks: BlockNode[] }
  | { ok: false; errors: string[] };

export function validateBlocks(input: unknown, extraTypes: readonly string[] = []): BlockValidation {
  if (!Array.isArray(input)) return { ok: false, errors: ['Blocks must be an array'] };
  const allowed = new Set([...CORE_TYPES, ...extraTypes]);
  const errors: string[] = [];
  let count = 0;
  const blocks = input.map((node, index) => readBlock(node, allowed, errors, `blocks[${index}]`, 0, () => {
    count += 1;
    if (count > MAX_NODES) errors.push('Block document exceeds 2000 nodes');
  }));
  if (errors.length) return { ok: false, errors: [...new Set(errors)].slice(0, 12) };
  return { ok: true, blocks: blocks.filter((block): block is BlockNode => block !== null) };
}

export function serializeBlocks(blocks: BlockNode[]): string {
  return blocks.map((block) => serializeBlock(block)).join('');
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readBlock(
  node: unknown,
  allowed: Set<string>,
  errors: string[],
  path: string,
  depth: number,
  count: () => void,
): BlockNode | null {
  count();
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (depth > MAX_DEPTH) {
    errors.push(`${path} is nested too deeply`);
    return null;
  }
  const record = node as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  if (!type || type.length > 80 || !allowed.has(type)) {
    errors.push(`${path} has unknown block type "${type || 'missing'}"`);
    return null;
  }
  const props = readProps(record.props, errors, path);
  const content = readContent(record.content, errors, path);
  const children = Array.isArray(record.children)
    ? record.children
        .map((child, index) => readBlock(child, allowed, errors, `${path}.children[${index}]`, depth + 1, count))
        .filter((child): child is BlockNode => child !== null)
    : [];
  const id = typeof record.id === 'string' && record.id.length <= 80 ? record.id : undefined;
  return { id, type, props, content, children };
}

function readProps(value: unknown, errors: string[], path: string) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path}.props must be an object`);
    return {};
  }
  const props: Record<string, string | number | boolean> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 24);
  for (const [key, raw] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
    if (typeof raw === 'string') props[key] = raw.slice(0, 5000);
    else if (typeof raw === 'boolean') props[key] = raw;
    else if (typeof raw === 'number' && Number.isFinite(raw)) props[key] = raw;
  }
  return props;
}

function readContent(value: unknown, errors: string[], path: string) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    if (value.length > 500) errors.push(`${path}.content is too long`);
    return value.slice(0, 500).map((node) => readInline(node, 0)).filter((node) => node !== null);
  }
  if (typeof value === 'object') {
    const encoded = JSON.stringify(value);
    if (encoded.length > 50_000) {
      errors.push(`${path}.content is too large`);
      return [];
    }
    return value;
  }
  errors.push(`${path}.content must be inline text or a table object`);
  return [];
}

function readInline(node: unknown, depth: number): unknown {
  if (!node || typeof node !== 'object' || depth > MAX_INLINE) return null;
  const record = node as Record<string, unknown>;
  const type = record.type === 'link' ? 'link' : 'text';
  const text = typeof record.text === 'string' ? record.text.slice(0, 20_000) : '';
  const href = typeof record.href === 'string' ? safeUrl(record.href) : '';
  const styles: Record<string, boolean> = {};
  if (record.styles && typeof record.styles === 'object') {
    for (const [key, raw] of Object.entries(record.styles as Record<string, unknown>)) {
      if (typeof raw === 'boolean' && /^[a-z]{1,20}$/.test(key)) styles[key] = raw;
    }
  }
  const content = Array.isArray(record.content)
    ? record.content.map((child) => readInline(child, depth + 1)).filter((child) => child !== null)
    : undefined;
  return { type, text, href, styles, content };
}

function serializeBlock(block: BlockNode): string {
  const inner = inlineHtml(block.content);
  const children = (block.children ?? []).map((child) => serializeBlock(child)).join('');
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(block.props?.level ?? 2)));
      return aligned(`<h${level}>${inner}</h${level}>${children}`, block.props);
    }
    case 'bulletListItem':
      return `<ul><li>${inner}${children}</li></ul>`;
    case 'numberedListItem':
      return `<ol><li>${inner}${children}</li></ol>`;
    case 'quote':
      return aligned(`<blockquote>${inner}</blockquote>${children}`, block.props);
    case 'pullquote':
      return aligned(`<figure class="op-pullquote"><blockquote>${inner}</blockquote></figure>`, block.props);
    case 'verse':
      return aligned(`<pre class="op-verse">${inner}</pre>`, block.props);
    case 'codeBlock':
      return `<pre><code>${inner}</code></pre>`;
    case 'image':
    case 'video':
    case 'audio':
    case 'file': {
      const url = safeUrl(String(block.props?.url ?? ''));
      const caption = escapeHtml(String(block.props?.caption ?? block.props?.name ?? ''));
      if (!url) return '';
      if (block.type === 'image') {
        return `<figure><img src="${escapeHtml(url)}" alt="${caption}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
      }
      return `<p><a href="${escapeHtml(url)}">${caption || escapeHtml(url)}</a></p>`;
    }
    case 'separator':
      return '<hr />';
    case 'spacer': {
      const height = Math.min(240, Math.max(0, Number(block.props?.height ?? 24)));
      return `<div style="height:${height}px" aria-hidden="true"></div>`;
    }
    case 'group':
      return `<div class="op-group">${inner}${children}</div>`;
    case 'columns':
      return `<div class="op-columns">${children}</div>`;
    case 'column':
      return `<div class="op-column">${inner}${children}</div>`;
    case 'buttons':
      return `<div class="op-buttons">${children}</div>`;
    case 'button': {
      const href = safeUrl(String(block.props?.url ?? ''));
      const label = inner || escapeHtml(String(block.props?.label ?? 'Button'));
      return href ? `<a class="op-button" href="${escapeHtml(href)}">${label}</a>` : `<span class="op-button">${label}</span>`;
    }
    case 'embed': {
      const href = safeUrl(String(block.props?.url ?? ''));
      return href ? `<p><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></p>` : '';
    }
    case 'reusable':
      return children || inner;
    case 'pluginBlock':
      return `<aside data-block="${escapeHtml(String(block.props?.name ?? 'plugin'))}">${escapeHtml(String(block.props?.title ?? ''))}</aside>`;
    case 'table':
      return `<div data-block="table">${inner}</div>`;
    default:
      return aligned(`<p>${inner}</p>${children}`, block.props);
  }
}

function aligned(html: string, props?: Record<string, string | number | boolean>) {
  const align = props?.align;
  if (align === 'center' || align === 'right') return `<div style="text-align:${align}">${html}</div>`;
  return html;
}

function inlineHtml(content: unknown): string {
  if (!Array.isArray(content)) {
    if (content && typeof content === 'object') return escapeHtml(JSON.stringify(content).slice(0, 2000));
    return '';
  }
  return content.map((node) => renderInline(node)).join('');
}

function renderInline(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as { type?: string; text?: string; href?: string; styles?: Record<string, boolean>; content?: unknown[] };
  const text = escapeHtml(record.text ?? '');
  const nested = Array.isArray(record.content) ? record.content.map((child) => renderInline(child)).join('') : '';
  let body = record.type === 'link' ? nested || text : text;
  const styles = record.styles ?? {};
  if (styles.code) body = `<code>${body}</code>`;
  if (styles.bold) body = `<strong>${body}</strong>`;
  if (styles.italic) body = `<em>${body}</em>`;
  if (styles.strike) body = `<s>${body}</s>`;
  if (record.type === 'link') {
    const href = safeUrl(record.href ?? '');
    if (!href) return body;
    return `<a href="${escapeHtml(href)}">${body}</a>`;
  }
  return body;
}

export function safeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') return url.toString();
  } catch {
    return '';
  }
  return '';
}
