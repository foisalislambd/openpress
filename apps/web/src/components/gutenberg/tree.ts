import { getBlockType, type BlockDefinition } from '@openpress/shared';

export type Inline = { type: 'text'; text: string; styles: Record<string, boolean> };

export type CanvasBlock = {
  id: string;
  type: string;
  props: Record<string, string | number | boolean>;
  content: Inline[];
  children: CanvasBlock[];
};

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function textOf(block: CanvasBlock) {
  return (block.content ?? []).map((part) => part.text).join('');
}

export function asBlocks(value: unknown[]): CanvasBlock[] {
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Partial<CanvasBlock> & { type?: string };
    if (!record.type) return [];
    return [
      {
        id: record.id || newId(),
        type: record.type,
        props: record.props && typeof record.props === 'object' ? { ...record.props } : {},
        content: Array.isArray(record.content)
          ? (record.content as Inline[])
          : [],
        children: asBlocks(Array.isArray(record.children) ? record.children : []),
      },
    ];
  });
}

function defaultsFor(definition: BlockDefinition | undefined) {
  const props: Record<string, string | number | boolean> = {};
  for (const [key, attribute] of Object.entries(definition?.attributes ?? {})) {
    if (attribute.default !== undefined) props[key] = attribute.default;
  }
  return props;
}

export function createBlock(type: string): CanvasBlock {
  const definition = getBlockType(type);
  const block: CanvasBlock = {
    id: newId(),
    type,
    props: defaultsFor(definition),
    content: definition?.supports.text ? [{ type: 'text', text: '', styles: {} }] : [],
    children: [],
  };
  if (type === 'columns') {
    block.children = [createBlock('column'), createBlock('column')];
  }
  if (type === 'list') {
    block.children = [createBlock('bulletListItem'), createBlock('bulletListItem')];
  }
  if (type === 'buttons') {
    block.children = [createBlock('button')];
  }
  return block;
}

export function findBlock(blocks: CanvasBlock[], id: string): CanvasBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = findBlock(block.children, id);
    if (nested) return nested;
  }
  return null;
}

function mapList(blocks: CanvasBlock[], id: string, map: (list: CanvasBlock[], index: number) => CanvasBlock[] | null): CanvasBlock[] | null {
  const index = blocks.findIndex((block) => block.id === id);
  if (index >= 0) return map(blocks, index);
  for (let i = 0; i < blocks.length; i += 1) {
    const next = mapList(blocks[i].children, id, map);
    if (next) {
      const copy = blocks.slice();
      copy[i] = { ...blocks[i], children: next };
      return copy;
    }
  }
  return null;
}

export function updateBlock(blocks: CanvasBlock[], id: string, patch: (block: CanvasBlock) => CanvasBlock) {
  return mapList(blocks, id, (list, index) => {
    const copy = list.slice();
    copy[index] = patch(list[index]);
    return copy;
  }) ?? blocks;
}

export function removeBlock(blocks: CanvasBlock[], id: string) {
  return mapList(blocks, id, (list, index) => list.filter((_, item) => item !== index)) ?? blocks;
}

export function insertAfter(blocks: CanvasBlock[], id: string | null, block: CanvasBlock) {
  if (!id) return [...blocks, block];
  return mapList(blocks, id, (list, index) => {
    const copy = list.slice();
    copy.splice(index + 1, 0, block);
    return copy;
  }) ?? [...blocks, block];
}

export function insertChild(blocks: CanvasBlock[], parentId: string, block: CanvasBlock) {
  return updateBlock(blocks, parentId, (current) => ({ ...current, children: [...current.children, block] }));
}

export function duplicateBlock(blocks: CanvasBlock[], id: string) {
  const source = findBlock(blocks, id);
  if (!source) return blocks;
  const clone = structuredClone(source) as CanvasBlock;
  const retarget = (block: CanvasBlock) => {
    block.id = newId();
    block.children.forEach(retarget);
  };
  retarget(clone);
  return insertAfter(blocks, id, clone);
}

export function moveSibling(blocks: CanvasBlock[], id: string, direction: -1 | 1) {
  return mapList(blocks, id, (list, index) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return list;
    const copy = list.slice();
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, moved);
    return copy;
  }) ?? blocks;
}

export function wrapInGroup(blocks: CanvasBlock[], id: string) {
  return mapList(blocks, id, (list, index) => {
    const copy = list.slice();
    const group = createBlock('group');
    group.children = [list[index]];
    copy[index] = group;
    return copy;
  }) ?? blocks;
}

export function transformBlock(blocks: CanvasBlock[], id: string, type: string) {
  return updateBlock(blocks, id, (block) => {
    const next = createBlock(type);
    next.id = block.id;
    if (getBlockType(type)?.supports.text && block.content.length) next.content = block.content;
    return next;
  });
}

export interface OutlineRow {
  block: CanvasBlock;
  depth: number;
}

export function reorder(blocks: CanvasBlock[], fromId: string, toId: string) {
  if (fromId === toId) return blocks;
  const source = findBlock(blocks, fromId);
  if (!source || findBlock([source], toId)) return blocks;
  return insertAfter(removeBlock(blocks, fromId), toId, source);
}

export function outline(blocks: CanvasBlock[], depth = 0): OutlineRow[] {
  return blocks.flatMap((block) => [{ block, depth }, ...outline(block.children, depth + 1)]);
}
