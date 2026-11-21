/**
 * Plugin-owned records. Field names and operators come from the collection
 * schema the plugin registered. Nothing here concatenates plugin text into
 * SQL identifiers.
 */

export type FieldType = 'string' | 'text' | 'number' | 'boolean';

export interface FieldDef {
  type: FieldType;
  required?: boolean;
  max?: number;
  /** Allowed string values. Compared as exact matches. */
  values?: string[];
}

export interface CollectionSchema {
  name: string;
  fields: Record<string, FieldDef>;
}

const NAME_RE = /^[a-z][a-z0-9_-]{0,40}$/;
const FIELD_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
const TYPES = new Set<FieldType>(['string', 'text', 'number', 'boolean']);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']);

export function parseCollectionSchema(input: unknown): CollectionSchema {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Collection schema must be an object');
  }
  const record = input as { name?: unknown; fields?: unknown };
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!NAME_RE.test(name)) throw new Error('Collection name must be lowercase and start with a letter');
  if (!record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) {
    throw new Error('Collection fields must be an object');
  }
  const entries = Object.entries(record.fields as Record<string, unknown>);
  if (entries.length < 1 || entries.length > 40) throw new Error('A collection needs between 1 and 40 fields');
  const fields: Record<string, FieldDef> = {};
  for (const [key, raw] of entries) {
    if (!FIELD_RE.test(key)) throw new Error(`Invalid field name "${key}"`);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Field "${key}" must be an object`);
    const def = raw as { type?: unknown; required?: unknown; max?: unknown; values?: unknown };
    const type = def.type === 'text' || def.type === 'number' || def.type === 'boolean' || def.type === 'string' ? def.type : null;
    if (!type || !TYPES.has(type)) throw new Error(`Field "${key}" has an unknown type`);
    const field: FieldDef = { type, required: def.required === true };
    if (def.max != null) {
      const max = Number(def.max);
      if (!Number.isInteger(max) || max < 1 || max > 20_000) throw new Error(`Field "${key}" has an invalid max`);
      field.max = max;
    }
    if (def.values != null) {
      if (!Array.isArray(def.values) || def.values.length > 20 || def.values.some((item) => typeof item !== 'string')) {
        throw new Error(`Field "${key}" values must be a short list of strings`);
      }
      field.values = def.values.map((item) => item.slice(0, 80));
    }
    fields[key] = field;
  }
  return { name, fields };
}

export function sanitizeRecord(schema: CollectionSchema, input: unknown, partial: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Record must be an object');
  const source = input as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (!(key in schema.fields)) throw new Error(`Unknown field "${key}"`);
  }
  for (const [key, field] of Object.entries(schema.fields)) {
    if (!(key in source)) {
      if (!partial && field.required) throw new Error(`Field "${key}" is required`);
      continue;
    }
    next[key] = coerceField(key, field, source[key]);
  }
  const encoded = JSON.stringify(next);
  if (encoded.length > 32_000) throw new Error('Record is too large');
  return next;
}

function coerceField(key: string, field: FieldDef, value: unknown) {
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`Field "${key}" must be a boolean`);
    return value;
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Field "${key}" must be a number`);
    return value;
  }
  if (typeof value !== 'string') throw new Error(`Field "${key}" must be a string`);
  const max = field.max ?? (field.type === 'text' ? 20_000 : 500);
  if (value.length > max) throw new Error(`Field "${key}" is too long`);
  if (field.values && !field.values.includes(value)) throw new Error(`Field "${key}" is not an allowed value`);
  return value;
}

type WhereNode =
  | { and: WhereNode[] }
  | { or: WhereNode[] }
  | { field: string; op: string; value: unknown };

export interface CompiledFilter {
  sql: string;
  params: unknown[];
  orderSql: string;
  limit: number;
  offset: number;
}

export function compileCollectionFilter(schema: CollectionSchema, query: unknown, startIndex = 1): CompiledFilter {
  const record = query && typeof query === 'object' && !Array.isArray(query) ? (query as Record<string, unknown>) : {};
  const params: unknown[] = [];
  let index = startIndex;
  const where = compileNode(normalizeWhere(schema, record.where), schema, params, () => {
    const current = index;
    index += 1;
    return current;
  });
  const order = compileOrder(schema, record.orderBy);
  const limit = clampInt(record.limit, 20, 1, 100);
  const offset = clampInt(record.offset, 0, 0, 10_000);
  return { sql: where || 'TRUE', params, orderSql: order, limit, offset };
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeWhere(schema: CollectionSchema, input: unknown): WhereNode | null {
  if (input == null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Filter must be an object');
  const record = input as Record<string, unknown>;
  if (Array.isArray(record.and)) return { and: record.and.map((item) => normalizeWhere(schema, item)).filter((item): item is WhereNode => item !== null) };
  if (Array.isArray(record.or)) return { or: record.or.map((item) => normalizeWhere(schema, item)).filter((item): item is WhereNode => item !== null) };
  const nodes: WhereNode[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (key === 'and' || key === 'or') continue;
    if (!(key in schema.fields)) throw new Error(`Unknown filter field "${key}"`);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const ops = Object.entries(raw as Record<string, unknown>);
      if (ops.length !== 1) throw new Error(`Filter on "${key}" needs one operator`);
      const [op, value] = ops[0];
      if (!OPS.has(op)) throw new Error(`Unknown filter operator "${op}"`);
      nodes.push({ field: key, op, value: coerceCompare(schema.fields[key], key, op, value) });
    } else {
      nodes.push({ field: key, op: 'eq', value: coerceCompare(schema.fields[key], key, 'eq', raw) });
    }
  }
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return { and: nodes };
}

function coerceCompare(field: FieldDef, key: string, op: string, value: unknown) {
  if (op === 'in') {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error(`Filter "${key}" in-list is invalid`);
    return value.map((item) => coerceField(key, { ...field, required: false }, item));
  }
  if (op === 'contains') {
    if (field.type === 'number' || field.type === 'boolean') throw new Error(`Field "${key}" does not support contains`);
    if (typeof value !== 'string' || value.length > 200) throw new Error(`Filter "${key}" contains must be a short string`);
    return value;
  }
  return coerceField(key, { ...field, required: false, values: undefined }, value);
}

function compileNode(node: WhereNode | null, schema: CollectionSchema, params: unknown[], next: () => number): string {
  if (!node) return '';
  if ('and' in node) {
    const parts = node.and.map((child) => compileNode(child, schema, params, next)).filter(Boolean);
    return parts.length ? `(${parts.join(' AND ')})` : '';
  }
  if ('or' in node) {
    const parts = node.or.map((child) => compileNode(child, schema, params, next)).filter(Boolean);
    return parts.length ? `(${parts.join(' OR ')})` : '';
  }
  const field = schema.fields[node.field];
  const expr = field.type === 'number' ? `(data->>$${next()})::numeric` : `data->>$${next()}`;
  params.push(node.field);
  if (node.op === 'in') {
    const values = node.value as unknown[];
    const slots = values.map((value) => {
      params.push(field.type === 'number' ? Number(value) : field.type === 'boolean' ? String(value) : String(value));
      return `$${next()}`;
    });
    return `${expr} IN (${slots.join(', ')})`;
  }
  if (node.op === 'contains') {
    params.push(`%${escapeLike(String(node.value))}%`);
    return `${expr} ILIKE $${next()}`;
  }
  const op = node.op === 'neq' ? '<>' : node.op === 'gt' ? '>' : node.op === 'gte' ? '>=' : node.op === 'lt' ? '<' : node.op === 'lte' ? '<=' : '=';
  params.push(field.type === 'boolean' ? String(node.value) : field.type === 'number' ? Number(node.value) : String(node.value));
  return `${expr} ${op} $${next()}`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function compileOrder(schema: CollectionSchema, input: unknown) {
  if (input == null) return '"createdAt" DESC';
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('orderBy must be an object');
  const record = input as { field?: unknown; direction?: unknown };
  const field = typeof record.field === 'string' ? record.field : 'createdAt';
  if (field !== 'createdAt' && field !== 'updatedAt' && !(field in schema.fields)) throw new Error('Unknown order field');
  const direction = record.direction === 'asc' ? 'ASC' : 'DESC';
  if (field === 'createdAt' || field === 'updatedAt') return `"${field}" ${direction}`;
  const type = schema.fields[field].type;
  if (type === 'number') return `(data->>'${field}')::numeric ${direction}`;
  return `data->>'${field}' ${direction}`;
}
