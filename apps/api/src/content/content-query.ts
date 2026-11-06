/**
 * Typed content query. Callers pass a structure; this file is the only place
 * that turns it into SQL. Filters may change the structure, never the SQL text.
 */

export class ContentQueryError extends Error {}

export interface MetaClause {
  key: string;
  value?: unknown;
  compare?: 'eq' | 'neq' | 'gt' | 'lt' | 'like' | 'exists';
}

export interface ContentQueryInput {
  type?: string | string[];
  postType?: string;
  /** When listing builtin posts, hide custom post types unless one was requested. */
  constrainBuiltinPosts?: boolean;
  locale?: string;
  status?: string | string[];
  visibility?: string | string[];
  authorId?: string;
  search?: string;
  category?: string | string[];
  tag?: string | string[];
  meta?: MetaClause[];
  after?: string;
  before?: string;
  dateColumn?: 'publishedAt' | 'createdAt' | 'updatedAt';
  orderBy?: 'date' | 'title' | 'modified' | 'relevance';
  order?: 'ASC' | 'DESC';
  sticky?: 'only' | 'exclude';
  publicOnly?: boolean;
  page?: number | string;
  perPage?: number | string;
}

export interface BuiltContentQuery {
  where: string;
  order: string;
  params: unknown[];
  page: number;
  perPage: number;
}

const TYPES = new Set(['POST', 'PAGE']);
const STATUSES = new Set(['DRAFT', 'PENDING', 'PUBLISHED', 'SCHEDULED', 'TRASHED']);
const VISIBILITY = new Set(['PUBLIC', 'PRIVATE', 'PASSWORD']);
const META_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/i;
const POST_TYPE = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const LOCALE = /^[a-zA-Z0-9_-]{2,16}$/;

export function buildContentQuery(input: ContentQueryInput): BuiltContentQuery {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const add = (sql: string, ...values: unknown[]) => {
    let text = sql;
    for (const value of values) {
      params.push(value);
      text = text.replace('$?', () => `$${params.length}`);
    }
    clauses.push(text);
  };

  const types = asList(input.type);
  if (types.some((type) => !TYPES.has(type))) throw new ContentQueryError('Invalid content type');
  if (types.length === 1) add('c.type = $?::"ContentType"', types[0]);
  else if (types.length > 1) add('c.type = ANY($?::"ContentType"[])', types);

  if (input.postType) {
    if (!POST_TYPE.test(input.postType)) throw new ContentQueryError('Invalid post type');
    add('c."postType" = $?', input.postType);
  } else if (input.constrainBuiltinPosts) {
    clauses.push(`c."postType" = 'post'`);
  }

  if (input.locale) {
    if (!LOCALE.test(input.locale)) throw new ContentQueryError('Invalid locale');
    add('c.locale = $?', input.locale);
  }

  if (input.publicOnly) {
    clauses.push(`c.status = 'PUBLISHED'`);
    clauses.push(`c.visibility IN ('PUBLIC', 'PASSWORD')`);
  } else {
    const statuses = asList(input.status);
    if (statuses.some((status) => !STATUSES.has(status))) throw new ContentQueryError('Invalid status');
    if (statuses.length === 1) add('c.status = $?::"ContentStatus"', statuses[0]);
    else if (statuses.length > 1) add('c.status = ANY($?::"ContentStatus"[])', statuses);
    else clauses.push(`c.status <> 'TRASHED'`);
    const visibility = asList(input.visibility);
    if (visibility.some((item) => !VISIBILITY.has(item))) throw new ContentQueryError('Invalid visibility');
    if (visibility.length) add('c.visibility = ANY($?::text[])', visibility);
  }

  if (input.authorId) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.authorId)) throw new ContentQueryError('Invalid author');
    add('c."authorId" = $?', input.authorId);
  }

  let searchParam: number | null = null;
  if (input.search?.trim()) {
    const like = `%${input.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const text = input.search.replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();
    if (text) {
      add(
        `(c.title ILIKE $? ESCAPE '\\' OR c.excerpt ILIKE $? ESCAPE '\\'
          OR to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.excerpt, ''))
             @@ plainto_tsquery('english', $?))`,
        like,
        like,
        text,
      );
      searchParam = params.length;
    } else {
      add(`(c.title ILIKE $? ESCAPE '\\' OR c.excerpt ILIKE $? ESCAPE '\\')`, like, like);
    }
  }

  for (const slug of asList(input.category)) {
    if (!SLUG.test(slug)) throw new ContentQueryError('Invalid category');
    add(
      `EXISTS (
         SELECT 1 FROM "_ContentCategories" cc
         JOIN categories cat ON cat.id = cc."A"
         WHERE cc."B" = c.id AND cat.slug = $?
       )`,
      slug,
    );
  }
  for (const slug of asList(input.tag)) {
    if (!SLUG.test(slug)) throw new ContentQueryError('Invalid tag');
    add(
      `EXISTS (
         SELECT 1 FROM "_ContentTags" ct
         JOIN tags tag ON tag.id = ct."B"
         WHERE ct."A" = c.id AND tag.slug = $?
       )`,
      slug,
    );
  }

  const column = input.dateColumn ?? 'publishedAt';
  if (!['publishedAt', 'createdAt', 'updatedAt'].includes(column)) {
    throw new ContentQueryError('Invalid date column');
  }
  if (input.after) add(`c."${column}" >= $?::timestamptz`, iso(input.after));
  if (input.before) add(`c."${column}" < $?::timestamptz`, iso(input.before));

  if (input.sticky === 'only') clauses.push('c.sticky = true');
  if (input.sticky === 'exclude') clauses.push('c.sticky = false');

  for (const meta of input.meta ?? []) {
    if (!META_KEY.test(meta.key)) throw new ContentQueryError('Invalid meta key');
    const compare = meta.compare ?? (meta.value === undefined ? 'exists' : 'eq');
    if (compare === 'exists') {
      add(`EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = $?)`, meta.key);
      continue;
    }
    if (compare === 'gt' || compare === 'lt') {
      const number = Number(meta.value);
      if (!Number.isFinite(number)) throw new ContentQueryError('Meta comparison needs a number');
      const op = compare === 'gt' ? '>' : '<';
      add(
        `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = $? AND (m."metaValue"#>>'{}')::numeric ${op} $?)`,
        meta.key,
        number,
      );
      continue;
    }
    if (compare === 'like') {
      add(
        `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = $? AND m."metaValue"#>>'{}' ILIKE $?)`,
        meta.key,
        `%${String(meta.value ?? '').replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
      );
      continue;
    }
    const op = compare === 'neq' ? '<>' : '=';
    add(
      `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = $? AND m."metaValue" ${op} $?::jsonb)`,
      meta.key,
      JSON.stringify(meta.value ?? null),
    );
  }

  const page = clamp(input.page, 1, 1, 1_000_000);
  const perPage = clamp(input.perPage, 10, 1, 50);
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    order: orderClause(input, searchParam),
    params,
    page,
    perPage,
  };
}

function orderClause(input: ContentQueryInput, searchParam: number | null) {
  if (!input.orderBy && !input.publicOnly) {
    return `ORDER BY c."publishedAt" DESC NULLS FIRST, c."createdAt" DESC`;
  }
  const dir = input.order === 'ASC' ? 'ASC' : 'DESC';
  const sticky = input.publicOnly && !input.orderBy ? 'c.sticky DESC, ' : '';
  if (input.orderBy === 'title') return `ORDER BY ${sticky}c.title ${dir}, c.id ASC`;
  if (input.orderBy === 'modified') return `ORDER BY ${sticky}c."updatedAt" ${dir}, c.id ASC`;
  if (input.orderBy === 'relevance' && searchParam) {
    return `ORDER BY ${sticky}ts_rank(to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.excerpt, '')), plainto_tsquery('english', $${searchParam})) DESC, c."publishedAt" DESC NULLS LAST`;
  }
  const nulls = input.publicOnly ? 'NULLS LAST' : 'NULLS FIRST';
  return `ORDER BY ${sticky}c."publishedAt" ${dir} ${nulls}, c."createdAt" ${dir}`;
}

function asList(value: string | string[] | undefined) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => item.trim()).filter(Boolean);
}

function iso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ContentQueryError('Invalid date');
  return date.toISOString();
}

function clamp(value: number | string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
