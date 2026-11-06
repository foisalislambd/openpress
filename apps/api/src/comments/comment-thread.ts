export const MAX_COMMENT_DEPTH = 5;

export interface ThreadRow {
  id: string;
  parentId: string | null;
}

export function commentDepth(rows: readonly ThreadRow[], parentId: string | null) {
  if (!parentId) return 1;
  const parents = new Map(rows.map((row) => [row.id, row.parentId]));
  let depth = 2;
  let current = parents.get(parentId) ?? null;
  const seen = new Set<string>([parentId]);
  while (current) {
    if (seen.has(current)) return MAX_COMMENT_DEPTH + 1;
    seen.add(current);
    depth += 1;
    current = parents.get(current) ?? null;
  }
  return depth;
}

export function threadComments<T extends ThreadRow>(rows: readonly T[], maxDepth = MAX_COMMENT_DEPTH) {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(row);
    children.set(parent, list);
  }
  const walk = (parentId: string | null, depth: number): Array<T & { replies: ReturnType<typeof walk> }> =>
    (children.get(parentId) ?? []).map((row) => ({
      ...row,
      replies: depth >= maxDepth ? [] : walk(row.id, depth + 1),
    }));
  return walk(null, 1);
}
