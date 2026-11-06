'use client';

import { useState } from 'react';
import { getBlockType } from '@openpress/shared';
import type { CanvasBlock } from './tree';
import { WpIcon } from './wp-icons';

export function BlockToolbar({
  block,
  onMove,
  onTransform,
  onAlign,
  onDuplicate,
  onRemove,
  onCopy,
  onGroup,
  onLevel,
}: {
  block: CanvasBlock;
  onMove: (direction: -1 | 1) => void;
  onTransform: (type: string) => void;
  onAlign: (align: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onCopy: () => void;
  onGroup: () => void;
  onLevel: (level: number) => void;
}) {
  const [more, setMore] = useState(false);
  const [transform, setTransform] = useState(false);
  const definition = getBlockType(block.type);
  const targets = (definition?.transforms ?? [])
    .map((name) => getBlockType(name))
    .filter((item) => item && item.name !== block.type && item.inserter);

  return (
    <div className="op-gb-toolbar" role="toolbar" aria-label={`${definition?.title ?? block.type} toolbar`} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        draggable
        aria-label="Drag"
        title="Drag"
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', block.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
      >
        <WpIcon name="drag-handle" />
      </button>
      <button type="button" aria-label="Move up" onClick={() => onMove(-1)}>
        <WpIcon name="chevron-up" />
      </button>
      <button type="button" aria-label="Move down" onClick={() => onMove(1)}>
        <WpIcon name="chevron-down" />
      </button>
      {targets.length ? (
        <span style={{ position: 'relative' }}>
          <button type="button" aria-label="Transform" onClick={() => { setTransform((value) => !value); setMore(false); }}>
            <WpIcon name="block-default" />
          </button>
          {transform ? (
            <div className="op-gb-menu" role="menu">
              {targets.map((item) => (
                <button key={item!.name} type="button" onClick={() => { onTransform(item!.name); setTransform(false); }}>
                  {item!.title}
                </button>
              ))}
            </div>
          ) : null}
        </span>
      ) : null}
      {definition?.supports.align ? (
        <>
          {(['left', 'center', 'right'] as const).map((align) => (
            <button key={align} type="button" aria-label={`Align ${align}`} aria-pressed={String(block.props.align ?? 'left') === align} onClick={() => onAlign(align)}>
              <WpIcon name={`align-${align}`} />
            </button>
          ))}
        </>
      ) : null}
      {block.type === 'heading' ? (
        <span>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <button key={level} type="button" aria-label={`Heading ${level}`} onClick={() => onLevel(level)}>
              H{level}
            </button>
          ))}
        </span>
      ) : null}
      <span style={{ position: 'relative' }}>
        <button type="button" aria-label="Options" onClick={() => { setMore((value) => !value); setTransform(false); }}>
          <WpIcon name="more-vertical" />
        </button>
        {more ? (
          <div className="op-gb-menu" role="menu">
            <button type="button" onClick={() => { onDuplicate(); setMore(false); }}>Duplicate</button>
            <button type="button" onClick={() => { onCopy(); setMore(false); }}>Copy</button>
            <button type="button" onClick={() => { onGroup(); setMore(false); }}>Group</button>
            <button type="button" onClick={() => { onRemove(); setMore(false); }}>Remove</button>
          </div>
        ) : null}
      </span>
    </div>
  );
}
