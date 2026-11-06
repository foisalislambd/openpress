import { kses } from '../html/kses';
import { registerServerBlock } from './render-types';

registerServerBlock('columns', (block, ctx) => `<div class="op-columns">${ctx.children(block)}</div>`);
registerServerBlock('column', (block, ctx) => `<div class="op-column">${ctx.inline(block.content)}${ctx.children(block)}</div>`);
registerServerBlock('group', (block, ctx) => ctx.align(`<div class="op-group">${ctx.inline(block.content)}${ctx.children(block)}</div>`, block.props));
registerServerBlock('buttons', (block, ctx) => `<div class="op-buttons">${ctx.children(block)}</div>`);

registerServerBlock('button', (block, ctx) => {
  const href = ctx.url(String(block.props?.url ?? ''));
  const label = ctx.inline(block.content) || ctx.escape(String(block.props?.label ?? 'Button'));
  const html = href ? `<a class="op-button" href="${ctx.escape(href)}">${label}</a>` : `<span class="op-button">${label}</span>`;
  return ctx.align(html, block.props);
});

registerServerBlock('separator', () => '<hr />');
registerServerBlock('spacer', (block) => {
  const height = Math.min(240, Math.max(0, Number(block.props?.height ?? 24)));
  return `<div style="height:${height}px" aria-hidden="true"></div>`;
});

registerServerBlock('html', (block) => `<div class="op-html">${kses(String(block.props?.html ?? ''))}</div>`);
registerServerBlock('reusable', (block, ctx) => ctx.children(block) || ctx.inline(block.content));
registerServerBlock('pluginBlock', (block, ctx) => {
  const name = ctx.escape(String(block.props?.name ?? 'plugin'));
  const title = ctx.escape(String(block.props?.title ?? ''));
  return `<aside data-block="${name}">${title}</aside>`;
});
