import { registerServerBlock } from './render-types';

registerServerBlock('embed', (block, ctx) => {
  const href = ctx.url(String(block.props?.url ?? ''));
  return href ? `<p><a href="${ctx.escape(href)}">${ctx.escape(href)}</a></p>` : '';
});

registerServerBlock('table', (block, ctx) => {
  let rows: unknown = [];
  try {
    rows = JSON.parse(String(block.props?.rows ?? '[]'));
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows)) return '<table></table>';
  const body = rows
    .slice(0, 40)
    .map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return `<tr>${cells.slice(0, 12).map((cell) => `<td>${ctx.escape(String(cell ?? ''))}</td>`).join('')}</tr>`;
    })
    .join('');
  return `<table><tbody>${body}</tbody></table>`;
});

import './render-text';
import './render-media';
import './render-design';
