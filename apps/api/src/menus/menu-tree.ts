export interface FlatMenuItem {
  id: string;
  parentId: string | null;
  position: number;
  title: string;
  url: string;
  type: string;
  objectId: string | null;
  target: string;
}

export interface MenuNode extends FlatMenuItem {
  children: MenuNode[];
}

export function nestMenuItems(items: FlatMenuItem[]): MenuNode[] {
  const nodes = new Map<string, MenuNode>();
  for (const item of items) nodes.set(item.id, { ...item, children: [] });
  const roots: MenuNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (!parent || parent.id === node.id || createsCycle(nodes, node.id, node.parentId)) {
      node.parentId = null;
      roots.push(node);
    } else parent.children.push(node);
  }
  const sort = (list: MenuNode[]) => {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

export function menuParentError(items: { id: string; parentId: string | null }[], id: string, parentId: string | null) {
  if (!parentId) return null;
  if (parentId === id) return 'A menu item cannot be its own parent';
  const map = new Map(items.map((item) => [item.id, item.parentId]));
  if (!map.has(parentId) && parentId !== id) return 'Parent item was not found';
  map.set(id, parentId);
  let cursor: string | null = parentId;
  const seen = new Set<string>([id]);
  while (cursor) {
    if (seen.has(cursor)) return 'Menu items cannot contain a cycle';
    seen.add(cursor);
    cursor = map.get(cursor) ?? null;
  }
  return null;
}

export function safeMenuUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('..')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch {
    return null;
  }
  return null;
}

function createsCycle(nodes: Map<string, MenuNode>, id: string, parentId: string | null) {
  let cursor = parentId;
  const seen = new Set<string>([id]);
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = nodes.get(cursor)?.parentId ?? null;
  }
  return false;
}
