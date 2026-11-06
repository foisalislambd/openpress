import { blocksToLines } from '../cms/publishing';

export interface EmDashEntry {
  title: string;
  slug?: string;
  type: 'POST' | 'PAGE';
  status: 'DRAFT' | 'PUBLISHED' | 'PENDING' | 'SCHEDULED' | 'TRASHED';
  visibility: 'PUBLIC' | 'PRIVATE' | 'PASSWORD';
  excerpt: string;
  blocks: unknown[];
  categories: string[];
  tags: string[];
  fields: Record<string, string>;
  publishedAt?: string;
}

export interface FieldMapping {
  title?: string;
  slug?: string;
  body?: string;
  excerpt?: string;
  status?: string;
  type?: string;
  categories?: string;
  tags?: string;
}

const STATUS_MAP: Record<string, EmDashEntry['status']> = {
  publish: 'PUBLISHED',
  published: 'PUBLISHED',
  public: 'PUBLISHED',
  draft: 'DRAFT',
  pending: 'PENDING',
  pending_review: 'PENDING',
  future: 'SCHEDULED',
  scheduled: 'SCHEDULED',
  trash: 'TRASHED',
  trashed: 'TRASHED',
  private: 'PUBLISHED',
};

/**
 * Reads an EmDash-style JSON dump, an OpenPress `{ posts: [] }` file, or a
 * generic `{ records, mapping }` file. Unknown status strings stay drafts.
 */
export function parseEmDash(input: unknown, mapping?: FieldMapping): EmDashEntry[] {
  const root = asRecord(input);
  if (!root) return [];
  const map = { ...asMapping(root.mapping), ...mapping };
  const records = firstArray(root, ['entries', 'posts', 'items', 'records', 'documents']);
  return records.map((record) => entryFrom(record, map)).filter((entry): entry is EmDashEntry => Boolean(entry?.title));
}

export function htmlToBlocks(html: string): unknown[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 && text.trim()) lines.push(text.trim());
  return lines.map((line, index) => ({
    id: `emdash-${index}`,
    type: 'paragraph',
    props: {},
    content: [{ type: 'text', text: line, styles: {} }],
    children: [],
  }));
}

export function blocksPreview(blocks: unknown) {
  return blocksToLines(blocks).join('\n');
}

function entryFrom(value: unknown, mapping: FieldMapping): EmDashEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = pick(record, mapping.title, ['title', 'name', 'headline']);
  if (!title) return null;
  const body = pick(record, mapping.body, ['html', 'body', 'content', 'markdown', 'text']);
  const statusRaw = pick(record, mapping.status, ['status', 'state']).toLowerCase();
  const typeRaw = pick(record, mapping.type, ['type', 'kind']).toLowerCase();
  const visibilityRaw = String(record.visibility ?? record.access ?? '').toLowerCase();
  const blocks = Array.isArray(record.blocks) ? record.blocks : htmlToBlocks(body);
  return {
    title,
    slug: pick(record, mapping.slug, ['slug', 'path', 'name']) || undefined,
    type: typeRaw === 'page' ? 'PAGE' : 'POST',
    status: STATUS_MAP[statusRaw] ?? 'DRAFT',
    visibility: visibilityRaw === 'private' ? 'PRIVATE' : visibilityRaw === 'password' ? 'PASSWORD' : 'PUBLIC',
    excerpt: pick(record, mapping.excerpt, ['excerpt', 'summary', 'description']),
    blocks,
    categories: stringList(record, mapping.categories, ['categories', 'category']),
    tags: stringList(record, mapping.tags, ['tags', 'tag']),
    fields: stringFields(record.fields ?? record.meta),
    publishedAt: pick(record, undefined, ['publishedAt', 'published_at', 'date']) || undefined,
  };
}

function pick(record: Record<string, unknown>, mapped: string | undefined, keys: string[]) {
  const names = mapped ? [mapped, ...keys] : keys;
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function stringList(record: Record<string, unknown>, mapped: string | undefined, keys: string[]) {
  const names = mapped ? [mapped, ...keys] : keys;
  for (const name of names) {
    const value = record[name];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object' && 'name' in item) return String((item as { name: unknown }).name);
          return '';
        })
        .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function stringFields(value: unknown) {
  const record = asRecord(value);
  if (!record) return {};
  const fields: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      fields[key.slice(0, 80)] = String(item).slice(0, 5000);
    }
  }
  return fields;
}

function firstArray(root: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asMapping(value: unknown): FieldMapping {
  const record = asRecord(value);
  if (!record) return {};
  const mapping: FieldMapping = {};
  for (const key of ['title', 'slug', 'body', 'excerpt', 'status', 'type', 'categories', 'tags'] as const) {
    if (typeof record[key] === 'string') mapping[key] = record[key];
  }
  return mapping;
}
