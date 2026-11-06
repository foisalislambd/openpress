'use client';

import { getBlockType } from '@openpress/shared';
import { outline, textOf, type CanvasBlock } from './tree';

export function ListView({
  blocks,
  selected,
  onSelect,
  onMove,
}: {
  blocks: CanvasBlock[];
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const rows = outline(blocks);
  return (
    <aside className="op-gb-list" aria-label="List view">
      <div className="op-gb-panel">
        <p className="op-gb-label">List view</p>
        {rows.length === 0 ? <p style={{ color: '#757575' }}>No blocks yet.</p> : null}
        {rows.map(({ block, depth }) => {
          const title = getBlockType(block.type)?.title ?? block.type;
          const preview = textOf(block).slice(0, 42);
          return (
            <div key={block.id} style={{ display: 'flex', paddingLeft: depth * 14 }}>
              <button
                type="button"
                className={`op-gb-outline ${selected === block.id ? 'is-on' : ''}`}
                onClick={() => onSelect(block.id)}
              >
                <span className={`dashicons dashicons-${getBlockType(block.type)?.icon ?? 'block-default'}`} aria-hidden />
                <span>{preview || title}</span>
              </button>
              <button type="button" className="op-gb-icon" aria-label={`Move ${title} up`} onClick={() => onMove(block.id, -1)}>
                <span className="dashicons dashicons-arrow-up-alt2" />
              </button>
              <button type="button" className="op-gb-icon" aria-label={`Move ${title} down`} onClick={() => onMove(block.id, 1)}>
                <span className="dashicons dashicons-arrow-down-alt2" />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
