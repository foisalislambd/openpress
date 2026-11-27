const TYPE_NAME = /^[A-Z][A-Za-z0-9]{0,40}$/;
const FIELD_NAME = /^[a-zA-Z][A-Za-z0-9_]{0,40}$/;
const TYPE_REF = /^\[?[A-Z][A-Za-z0-9]{0,40}!?\]?!?$/;
const ARGS = /^[a-zA-Z0-9_\[\]!:,\s]{0,200}$/;
const RESERVED_FIELDS = new Set(['posts', 'post', 'media', 'categories', 'tags', 'comments']);
const RESERVED_TYPES = new Set(['Post', 'PostList', 'MediaItem', 'Term', 'Comment', 'Query', 'Mutation']);

export interface GraphqlTypeInput {
  pluginId: string;
  sdl: string;
}

export interface GraphqlFieldInput {
  pluginId: string;
  role: 'query' | 'mutation';
  name: string;
  args: string;
  returns: string;
}

export interface CompiledGraphql {
  types: string;
  queries: string[];
  mutations: string[];
  fields: GraphqlFieldInput[];
}

export function parseGraphqlType(sdl: string) {
  const match = /^type\s+([A-Z][A-Za-z0-9]{0,40})\s*\{([^{}]{1,800})\}$/.exec(String(sdl || '').trim());
  if (!match) return null;
  const name = match[1];
  if (RESERVED_TYPES.has(name) || !TYPE_NAME.test(name)) return null;
  const body = match[2].trim();
  const declarations = body.split('\n').map((line) => line.trim()).filter(Boolean);
  if (declarations.length === 0 || declarations.length > 20) return null;
  for (const declaration of declarations) {
    const field = /^([a-zA-Z][A-Za-z0-9_]{0,40})\s*:\s*(\[?[A-Z][A-Za-z0-9]{0,40}!?\]?!?)$/.exec(declaration);
    if (!field || RESERVED_TYPES.has(field[2].replace(/[\[\]!]/g, ''))) return null;
  }
  return { name, sdl: `type ${name} { ${declarations.join(' ')} }` };
}

export function parseGraphqlField(input: { name: string; args?: string; returns: string }) {
  const name = String(input.name || '');
  const returns = String(input.returns || '').replace(/\s+/g, '');
  const args = String(input.args || '').trim();
  if (!FIELD_NAME.test(name) || RESERVED_FIELDS.has(name)) return null;
  if (!TYPE_REF.test(returns)) return null;
  if (args && !ARGS.test(args)) return null;
  if (args && !/^[a-zA-Z][A-Za-z0-9_]*\s*:\s*\[?[A-Z]/.test(args)) return null;
  return { name, args, returns };
}

export function compilePluginGraphql(types: GraphqlTypeInput[], fields: GraphqlFieldInput[]): CompiledGraphql {
  const acceptedTypes: string[] = [];
  const names = new Set<string>();
  for (const type of types) {
    const parsed = parseGraphqlType(type.sdl);
    if (!parsed || names.has(parsed.name)) continue;
    names.add(parsed.name);
    acceptedTypes.push(parsed.sdl);
  }
  const accepted: GraphqlFieldInput[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const parsed = parseGraphqlField(field);
    if (!parsed) continue;
    const key = `${field.role}:${parsed.name}`;
    if (seen.has(key)) continue;
    const bare = parsed.returns.replace(/[\[\]!]/g, '');
    if (!['String', 'Int', 'Float', 'Boolean', 'ID'].includes(bare) && !names.has(bare)) continue;
    seen.add(key);
    accepted.push({ ...field, name: parsed.name, args: parsed.args, returns: parsed.returns });
  }
  const print = (field: GraphqlFieldInput) =>
    field.args ? `${field.name}(${field.args}): ${field.returns}` : `${field.name}: ${field.returns}`;
  return {
    types: acceptedTypes.join('\n'),
    queries: accepted.filter((field) => field.role === 'query').map(print),
    mutations: accepted.filter((field) => field.role === 'mutation').map(print),
    fields: accepted,
  };
}

export function clampGraphqlValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 5000);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => clampGraphqlValue(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (!FIELD_NAME.test(key)) continue;
      out[key] = clampGraphqlValue(item, depth + 1);
    }
    return out;
  }
  return null;
}
