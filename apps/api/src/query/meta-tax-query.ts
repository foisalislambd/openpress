/**
 * WordPress-style meta_query and tax_query.
 * The tree is data. This file emits parameterized EXISTS clauses and nothing else.
 */

import { ContentQueryError } from './query-error';

const META_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const TAXONOMY = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COMPARES = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'not_like', 'in', 'not_in', 'between', 'exists', 'not_exists',
]);

export interface MetaClause {
  key: string;
  value?: unknown;
  compare?: string;
  type?: 'char' | 'numeric' | 'date';
}

export interface MetaGroup {
  relation?: 'AND' | 'OR';
  clauses: Array<MetaClause | MetaGroup>;
}

export interface TaxClause {
  taxonomy: string;
  terms?: string[];
  field?: 'slug' | 'id';
  operator?: 'IN' | 'NOT IN' | 'EXISTS' | 'NOT EXISTS';
  includeChildren?: boolean;
}

export interface TaxGroup {
  relation?: 'AND' | 'OR';
  clauses: Array<TaxClause | TaxGroup>;
}

type Push = (value: unknown) => string;

export function compileMetaQuery(input: MetaClause[] | MetaGroup | undefined, push: Push) {
  if (!input) return '';
  const group = Array.isArray(input) ? { relation: 'AND' as const, clauses: input } : input;
  return compileMetaGroup(group, push, 0);
}

export function compileTaxQuery(input: TaxGroup | undefined, push: Push, siteId?: string) {
  if (!input) return '';
  return compileTaxGroup(input, push, siteId, 0);
}

function compileMetaGroup(group: MetaGroup, push: Push, depth: number): string {
  if (depth > 4) throw new ContentQueryError('Meta query is nested too deeply');
  if (!Array.isArray(group.clauses)) throw new ContentQueryError('Meta query clauses must be a list');
  if (group.clauses.length > 32) throw new ContentQueryError('Meta query has too many clauses');
  const relation = (group.relation ?? 'AND').toUpperCase();
  if (relation !== 'AND' && relation !== 'OR') throw new ContentQueryError('Meta relation must be AND or OR');
  const parts = group.clauses
    .map((clause) => (isMetaGroup(clause) ? compileMetaGroup(clause, push, depth + 1) : metaExists(clause, push)))
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `(${parts.join(` ${relation} `)})`;
}

function metaExists(clause: MetaClause, push: Push) {
  if (!clause || typeof clause.key !== 'string' || !META_KEY.test(clause.key)) {
    throw new ContentQueryError('Invalid meta key');
  }
  const compare = clause.compare ?? (clause.value === undefined ? 'exists' : 'eq');
  if (!COMPARES.has(compare)) throw new ContentQueryError('Invalid meta compare');
  const key = push(clause.key);
  const valueSql = typedValue(clause.type);
  if (compare === 'exists') {
    return `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key})`;
  }
  if (compare === 'not_exists') {
    return `NOT EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key})`;
  }
  if (compare === 'gt' || compare === 'gte' || compare === 'lt' || compare === 'lte') {
    const number = Number(clause.value);
    if (!Number.isFinite(number)) throw new ContentQueryError('Meta comparison needs a number');
    const op = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[compare];
    const expr = clause.type === 'date' ? `(m."metaValue"#>>'{}')::timestamptz` : `(m."metaValue"#>>'{}')::numeric`;
    return `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key} AND ${expr} ${op} ${push(number)})`;
  }
  if (compare === 'like' || compare === 'not_like') {
    const like = `%${String(clause.value ?? '').replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const op = compare === 'like' ? 'ILIKE' : 'NOT ILIKE';
    return `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key} AND ${valueSql} ${op} ${push(like)} ESCAPE '\\')`;
  }
  if (compare === 'in' || compare === 'not_in') {
    const list = asValues(clause.value);
    if (!list.length) throw new ContentQueryError('Meta IN needs a list');
    const op = compare === 'in' ? '= ANY' : '<> ALL';
    return `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key} AND ${valueSql} ${op} (${push(list)}::text[]))`;
  }
  if (compare === 'between') {
    const list = asValues(clause.value);
    if (list.length !== 2) throw new ContentQueryError('Meta BETWEEN needs two values');
    return `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key} AND ${valueSql} >= ${push(list[0])} AND ${valueSql} <= ${push(list[1])})`;
  }
  const op = compare === 'neq' ? '<>' : '=';
  if (clause.type === 'numeric' || clause.type === 'date' || clause.type === 'char') {
    return `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key} AND ${valueSql} ${op} ${push(String(clause.value ?? ''))})`;
  }
  return `EXISTS (SELECT 1 FROM content_meta m WHERE m."contentId" = c.id AND m."metaKey" = ${key} AND m."metaValue" ${op} ${push(JSON.stringify(clause.value ?? null))}::jsonb)`;
}

function typedValue(type: MetaClause['type']) {
  if (type === 'numeric') return `(m."metaValue"#>>'{}')::numeric`;
  if (type === 'date') return `(m."metaValue"#>>'{}')::timestamptz`;
  if (type === 'char') return `m."metaValue"#>>'{}'`;
  return `m."metaValue"#>>'{}'`;
}

function compileTaxGroup(group: TaxGroup, push: Push, siteId: string | undefined, depth: number): string {
  if (depth > 4) throw new ContentQueryError('Tax query is nested too deeply');
  if (!Array.isArray(group.clauses)) throw new ContentQueryError('Tax query clauses must be a list');
  if (group.clauses.length > 32) throw new ContentQueryError('Tax query has too many clauses');
  const relation = (group.relation ?? 'AND').toUpperCase();
  if (relation !== 'AND' && relation !== 'OR') throw new ContentQueryError('Tax relation must be AND or OR');
  const parts = group.clauses
    .map((clause) => (isTaxGroup(clause) ? compileTaxGroup(clause, push, siteId, depth + 1) : taxExists(clause, push, siteId)))
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `(${parts.join(` ${relation} `)})`;
}

function taxExists(clause: TaxClause, push: Push, siteId: string | undefined) {
  if (!clause || !TAXONOMY.test(clause.taxonomy ?? '')) throw new ContentQueryError('Invalid taxonomy');
  const operator = clause.operator ?? 'IN';
  if (!['IN', 'NOT IN', 'EXISTS', 'NOT EXISTS'].includes(operator)) throw new ContentQueryError('Invalid tax operator');
  const field = clause.field ?? 'slug';
  if (field !== 'slug' && field !== 'id') throw new ContentQueryError('Invalid tax field');
  const terms = (clause.terms ?? []).map((term) => term.trim()).filter(Boolean);
  const site = siteId ? ` AND term."siteId" = ${push(siteId)}` : '';
  if (operator === 'EXISTS' || operator === 'NOT EXISTS') {
    const exists = taxonomyExists(clause.taxonomy, push, site);
    return operator === 'EXISTS' ? exists : `NOT ${exists}`;
  }
  if (!terms.length) throw new ContentQueryError('Tax query needs terms');
  for (const term of terms) {
    if (field === 'id' ? !ID.test(term) : !SLUG.test(term)) throw new ContentQueryError('Invalid term');
  }
  const negative = operator === 'NOT IN';
  const match = termMatch(clause, terms, field, push, site);
  return negative ? `NOT ${match}` : match;
}

function taxonomyExists(taxonomy: string, push: Push, site: string) {
  if (taxonomy === 'category') {
    return `EXISTS (SELECT 1 FROM "_ContentCategories" cc JOIN categories term ON term.id = cc."A" WHERE cc."B" = c.id${site})`;
  }
  if (taxonomy === 'post_tag') {
    return `EXISTS (SELECT 1 FROM "_ContentTags" ct JOIN tags term ON term.id = ct."B" WHERE ct."A" = c.id${site})`;
  }
  return `EXISTS (
    SELECT 1 FROM content_terms ct
    JOIN terms term ON term.id = ct."termId"
    WHERE ct."contentId" = c.id AND term.taxonomy = ${push(taxonomy)}${site}
  )`;
}

function termMatch(clause: TaxClause, terms: string[], field: 'slug' | 'id', push: Push, site: string) {
  const list = push(terms);
  const column = field === 'id' ? 'term.id' : 'term.slug';
  if (clause.taxonomy === 'category') {
    if (clause.includeChildren && field === 'slug') {
      return `EXISTS (
        WITH RECURSIVE tree AS (
          SELECT term.id FROM categories term WHERE term.slug = ANY(${list}::text[])${site}
          UNION ALL
          SELECT child.id FROM categories child JOIN tree ON child."parentId" = tree.id
        )
        SELECT 1 FROM "_ContentCategories" cc WHERE cc."B" = c.id AND cc."A" IN (SELECT id FROM tree)
      )`;
    }
    return `EXISTS (
      SELECT 1 FROM "_ContentCategories" cc
      JOIN categories term ON term.id = cc."A"
      WHERE cc."B" = c.id AND ${column} = ANY(${list}::text[])${site}
    )`;
  }
  if (clause.taxonomy === 'post_tag') {
    return `EXISTS (
      SELECT 1 FROM "_ContentTags" ct
      JOIN tags term ON term.id = ct."B"
      WHERE ct."A" = c.id AND ${column} = ANY(${list}::text[])${site}
    )`;
  }
  if (clause.includeChildren) {
    return `EXISTS (
      WITH RECURSIVE tree AS (
        SELECT term.id FROM terms term
        WHERE term.taxonomy = ${push(clause.taxonomy)} AND ${column} = ANY(${list}::text[])${site}
        UNION ALL
        SELECT child.id FROM terms child JOIN tree ON child."parentId" = tree.id
      )
      SELECT 1 FROM content_terms ct WHERE ct."contentId" = c.id AND ct."termId" IN (SELECT id FROM tree)
    )`;
  }
  return `EXISTS (
    SELECT 1 FROM content_terms ct
    JOIN terms term ON term.id = ct."termId"
    WHERE ct."contentId" = c.id AND term.taxonomy = ${push(clause.taxonomy)} AND ${column} = ANY(${list}::text[])${site}
  )`;
}

function isMetaGroup(value: MetaClause | MetaGroup): value is MetaGroup {
  return Array.isArray((value as MetaGroup).clauses);
}

function isTaxGroup(value: TaxClause | TaxGroup): value is TaxGroup {
  return Array.isArray((value as TaxGroup).clauses);
}

function asValues(value: unknown) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item ?? '')).filter((item) => item.length > 0 && item.length <= 200);
}
