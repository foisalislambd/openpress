'use client';

import { useState } from 'react';
import { getBlockType } from '@openpress/shared';
import { BlockToolbar } from './block-toolbar';
import { SlashMenu } from './inserter';
import { textOf, type CanvasBlock } from './tree';

export function BlockCanvas({
  blocks,
  selected,
  onSelect,
  onText,
  onProps,
  onMove,
  onTransform,
  onAlign,
  onDuplicate,
  onRemove,
  onCopy,
  onGroup,
  onLevel,
  onInsert,
  onAddChild,
  onReorder,
}: {
  blocks: CanvasBlock[];
  selected: string | null;
  onSelect: (id: string) => void;
  onText: (id: string, text: string) => void;
  onProps: (id: string, props: CanvasBlock['props']) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onTransform: (id: string, type: string) => void;
  onAlign: (id: string, align: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onCopy: (id: string) => void;
  onGroup: (id: string) => void;
  onLevel: (id: string, level: number) => void;
  onInsert: (type: string) => void;
  onAddChild: (parentId: string, type: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  return (
    <>
      {blocks.map((block) => (
        <BlockFrame
          key={block.id}
          block={block}
          selected={selected}
          onSelect={onSelect}
          onText={onText}
          onProps={onProps}
          onMove={onMove}
          onTransform={onTransform}
          onAlign={onAlign}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onCopy={onCopy}
          onGroup={onGroup}
          onLevel={onLevel}
          onInsert={onInsert}
          onAddChild={onAddChild}
          onReorder={onReorder}
        />
      ))}
    </>
  );
}

function BlockFrame(props: {
  block: CanvasBlock;
  selected: string | null;
  onSelect: (id: string) => void;
  onText: (id: string, text: string) => void;
  onProps: (id: string, props: CanvasBlock['props']) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onTransform: (id: string, type: string) => void;
  onAlign: (id: string, align: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onCopy: (id: string) => void;
  onGroup: (id: string) => void;
  onLevel: (id: string, level: number) => void;
  onInsert: (type: string) => void;
  onAddChild: (parentId: string, type: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const { block, selected } = props;
  const definition = getBlockType(block.type);
  const isSelected = selected === block.id;
  const [slash, setSlash] = useState('');
  const edit = definition?.edit ?? 'text';
  const columns = block.type === 'columns' || block.type === 'gallery' || block.type === 'buttons';

  function changeText(value: string) {
    if (value.startsWith('/')) {
      setSlash(value.slice(1));
      props.onText(block.id, value);
      return;
    }
    setSlash('');
    props.onText(block.id, value);
  }

  return (
    <div
      className={`op-gb-block ${isSelected ? 'is-selected' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const from = event.dataTransfer.getData('text/plain');
        if (from) props.onReorder(from, block.id);
      }}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(block.id);
      }}
    >
      {isSelected ? (
        <BlockToolbar
          block={block}
          onMove={(direction) => props.onMove(block.id, direction)}
          onTransform={(type) => props.onTransform(block.id, type)}
          onAlign={(align) => props.onAlign(block.id, align)}
          onDuplicate={() => props.onDuplicate(block.id)}
          onRemove={() => props.onRemove(block.id)}
          onCopy={() => props.onCopy(block.id)}
          onGroup={() => props.onGroup(block.id)}
          onLevel={(level) => props.onLevel(block.id, level)}
        />
      ) : null}
      {edit === 'text' ? (
        <div style={{ position: 'relative' }}>
          <textarea
            className={`op-gb-write ${block.type === 'heading' ? 'is-heading' : ''} ${block.type === 'codeBlock' || block.type === 'preformatted' || block.type === 'verse' ? 'is-code' : ''}`}
            rows={block.type === 'paragraph' ? 2 : 1}
            aria-label={definition?.title ?? block.type}
            placeholder={block.type === 'paragraph' ? 'Type / to choose a block' : definition?.title}
            value={textOf(block)}
            onChange={(event) => changeText(event.target.value)}
            onKeyDown={(event) => {
              if (slash && event.key === 'Enter') {
                event.preventDefault();
                const match = definition && getBlockType(slash) ? slash : '';
                const picked = match || slash;
                if (getBlockType(picked)?.inserter) {
                  props.onTransform(block.id, picked);
                  props.onText(block.id, '');
                  setSlash('');
                }
              }
            }}
          />
          {slash ? (
            <SlashMenu
              query={slash}
              onPick={(type) => {
                props.onTransform(block.id, type);
                props.onText(block.id, '');
                setSlash('');
              }}
            />
          ) : null}
        </div>
      ) : null}
      {edit === 'separator' ? <hr /> : null}
      {edit === 'spacer' ? <div style={{ height: Number(block.props.height ?? 48), background: 'repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0 6px,#fff 6px,#fff 12px)' }} /> : null}
      {edit === 'html' ? (
        <textarea
          className="op-gb-write is-code"
          rows={4}
          aria-label="Custom HTML"
          value={String(block.props.html ?? '')}
          onChange={(event) => props.onProps(block.id, { ...block.props, html: event.target.value })}
        />
      ) : null}
      {edit === 'table' ? <TableGrid block={block} onProps={(next) => props.onProps(block.id, next)} /> : null}
      {edit === 'media' || edit === 'url' ? (
        <MediaPreview block={block} />
      ) : null}
      {definition?.supports.text && edit !== 'text' ? (
        <textarea
          className="op-gb-write"
          rows={2}
          aria-label={`${definition.title} text`}
          value={textOf(block)}
          onChange={(event) => props.onText(block.id, event.target.value)}
        />
      ) : null}
      {edit === 'container' || block.children.length ? (
        <div className={columns ? 'op-gb-columns' : undefined}>
          {block.children.map((child) => (
            <div key={child.id} className={columns ? 'op-gb-column' : undefined}>
              <BlockFrame {...props} block={child} />
            </div>
          ))}
        </div>
      ) : null}
      {isSelected && (block.type === 'columns' || block.type === 'group' || block.type === 'list' || block.type === 'gallery' || block.type === 'buttons') ? (
        <button
          type="button"
          className="op-gb-textbtn"
          onClick={() => props.onAddChild(block.id, childType(block.type))}
        >
          Add {childLabel(block.type)}
        </button>
      ) : null}
    </div>
  );
}

function childType(type: string) {
  if (type === 'columns') return 'column';
  if (type === 'list') return 'bulletListItem';
  if (type === 'gallery') return 'image';
  if (type === 'buttons') return 'button';
  return 'paragraph';
}

function childLabel(type: string) {
  if (type === 'columns') return 'column';
  if (type === 'list') return 'list item';
  if (type === 'gallery') return 'image';
  if (type === 'buttons') return 'button';
  return 'block';
}

function MediaPreview({ block }: { block: CanvasBlock }) {
  const url = String(block.props.url ?? '');
  if (block.type === 'image' && url) {
    return <img className="op-gb-preview" src={url} alt={String(block.props.alt ?? '')} />;
  }
  if (block.type === 'cover') {
    return (
      <div style={{ minHeight: 120, padding: 16, color: '#fff', background: url ? `linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url(${url}) center/cover` : '#1e1e1e' }}>
        {textOf(block) || 'Cover'}
      </div>
    );
  }
  return <p style={{ color: '#757575' }}>{url || 'Add a URL in the block settings.'}</p>;
}

function TableGrid({ block, onProps }: { block: CanvasBlock; onProps: (props: CanvasBlock['props']) => void }) {
  let rows: string[][] = [['', ''], ['', '']];
  try {
    const parsed = JSON.parse(String(block.props.rows ?? '[]'));
    if (Array.isArray(parsed)) rows = parsed.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : ['']));
  } catch {
    rows = [['', '']];
  }
  function write(next: string[][]) {
    onProps({ ...block.props, rows: JSON.stringify(next) });
  }
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ border: '1px solid #e0e0e0' }}>
                  <input
                    aria-label={`Row ${rowIndex + 1} column ${cellIndex + 1}`}
                    value={cell}
                    style={{ width: '100%', border: 0, padding: 6 }}
                    onChange={(event) => {
                      const next = rows.map((line) => line.slice());
                      next[rowIndex][cellIndex] = event.target.value;
                      write(next);
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="op-gb-textbtn" onClick={() => write([...rows, rows[0].map(() => '')])}>Add row</button>
    </div>
  );
}
