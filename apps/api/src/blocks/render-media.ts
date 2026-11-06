import { registerServerBlock } from './render-types';

function figure(url: string, caption: string, inner: string) {
  if (!url) return '';
  return `<figure>${inner}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

registerServerBlock('image', (block, ctx) => {
  const url = ctx.url(String(block.props?.url ?? ''));
  const caption = ctx.escape(String(block.props?.caption ?? block.props?.alt ?? ''));
  const alt = ctx.escape(String(block.props?.alt ?? block.props?.caption ?? ''));
  return figure(url, caption, `<img src="${ctx.escape(url)}" alt="${alt}" />`);
});

registerServerBlock('gallery', (block, ctx) => `<figure class="op-gallery">${ctx.children(block)}</figure>`);

registerServerBlock('cover', (block, ctx) => {
  const url = ctx.url(String(block.props?.url ?? ''));
  const dim = Math.min(100, Math.max(0, Number(block.props?.dim ?? 50))) / 100;
  const image = url ? `background-image:url(${ctx.escape(url)});` : '';
  return `<div class="op-cover" style="${image}position:relative"><div style="background:rgba(0,0,0,${dim})"></div><div class="op-cover-inner">${ctx.inline(block.content)}${ctx.children(block)}</div></div>`;
});

registerServerBlock('video', (block, ctx) => {
  const url = ctx.url(String(block.props?.url ?? ''));
  const caption = ctx.escape(String(block.props?.caption ?? ''));
  return figure(url, caption, `<video src="${ctx.escape(url)}" controls></video>`);
});

registerServerBlock('audio', (block, ctx) => {
  const url = ctx.url(String(block.props?.url ?? ''));
  const caption = ctx.escape(String(block.props?.caption ?? ''));
  return figure(url, caption, `<audio src="${ctx.escape(url)}" controls></audio>`);
});

registerServerBlock('file', (block, ctx) => {
  const url = ctx.url(String(block.props?.url ?? ''));
  const label = ctx.escape(String(block.props?.label ?? 'Download'));
  if (!url) return '';
  return `<p><a href="${ctx.escape(url)}">${label}</a></p>`;
});
