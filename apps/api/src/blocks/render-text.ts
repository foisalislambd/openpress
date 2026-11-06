import type { BlockNode } from './block-document';
import type { RenderCtx } from './render-types';
import { registerServerBlock } from './render-types';

registerServerBlock('paragraph', (block, ctx) => ctx.align(`<p>${ctx.inline(block.content)}</p>${ctx.children(block)}`, block.props));

registerServerBlock('heading', (block, ctx) => {
  const level = Math.min(6, Math.max(1, Number(block.props?.level ?? 2)));
  return ctx.align(`<h${level}>${ctx.inline(block.content)}</h${level}>${ctx.children(block)}`, block.props);
});

registerServerBlock('list', (block, ctx) => {
  const tag = block.props?.ordered === true ? 'ol' : 'ul';
  return `<${tag} class="op-list">${ctx.children(block)}</${tag}>`;
});

function listItem(tag: 'ul' | 'ol', block: BlockNode, ctx: RenderCtx) {
  const inner = `<li>${ctx.inline(block.content)}${ctx.children(block)}</li>`;
  return ctx.parent === 'list' ? inner : `<${tag}>${inner}</${tag}>`;
}

registerServerBlock('bulletListItem', (block, ctx) => listItem('ul', block, ctx));
registerServerBlock('numberedListItem', (block, ctx) => listItem('ol', block, ctx));
registerServerBlock('checkListItem', (block, ctx) => {
  const mark = block.props?.checked ? 'checked' : '';
  return `<ul><li><input type="checkbox" disabled ${mark}/> ${ctx.inline(block.content)}</li></ul>`;
});
registerServerBlock('toggleListItem', (block, ctx) => `<details><summary>${ctx.inline(block.content)}</summary>${ctx.children(block)}</details>`);

registerServerBlock('quote', (block, ctx) => {
  const citation = String(block.props?.citation ?? '');
  const cite = citation ? `<cite>${ctx.escape(citation)}</cite>` : '';
  return ctx.align(`<blockquote>${ctx.inline(block.content)}${cite}</blockquote>${ctx.children(block)}`, block.props);
});

registerServerBlock('pullquote', (block, ctx) =>
  ctx.align(`<figure class="op-pullquote"><blockquote>${ctx.inline(block.content)}</blockquote></figure>`, block.props),
);

registerServerBlock('verse', (block, ctx) => ctx.align(`<pre class="op-verse">${ctx.inline(block.content)}</pre>`, block.props));
registerServerBlock('preformatted', (block, ctx) => ctx.align(`<pre class="op-preformatted">${ctx.inline(block.content)}</pre>`, block.props));
registerServerBlock('codeBlock', (block, ctx) => `<pre><code>${ctx.inline(block.content)}</code></pre>`);
