import type { BlockNode } from './block-document';

export interface RenderCtx {
  parent?: string;
  inline: (content: unknown) => string;
  children: (block: BlockNode) => string;
  escape: (value: string) => string;
  url: (value: string) => string;
  align: (html: string, props?: BlockNode['props']) => string;
}

export type BlockRenderer = (block: BlockNode, ctx: RenderCtx) => string;

const renderers = new Map<string, BlockRenderer>();

export function registerServerBlock(name: string, render: BlockRenderer) {
  renderers.set(name, render);
}

export function serverBlockNames() {
  return new Set(renderers.keys());
}

export function renderServerBlock(block: BlockNode, ctx: RenderCtx) {
  const render = renderers.get(block.type);
  return render ? render(block, ctx) : ctx.align(`<p>${ctx.inline(block.content)}</p>${ctx.children(block)}`, block.props);
}
