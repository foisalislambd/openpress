'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import { BlockInspector } from './block-inspector';
import { BlockCanvas } from './canvas';
import { Inserter, rememberBlock } from './inserter';
import { ListView } from './list-view';
import './editor.css';
import {
  asBlocks,
  createBlock,
  duplicateBlock,
  findBlock,
  insertAfter,
  insertChild,
  moveSibling,
  removeBlock,
  reorder,
  textOf,
  transformBlock,
  updateBlock,
  wrapInGroup,
  type CanvasBlock,
} from './tree';

export function EditorShell({
  initialBlocks,
  onChange,
  title,
  onTitleChange,
  backHref,
  backLabel,
  statusLabel,
  viewHref,
  saving,
  onSaveDraft,
  onReview,
  onPublish,
  publishLabel,
  notices,
  documentPanel,
}: {
  initialBlocks: unknown[];
  onChange: (blocks: unknown[]) => void;
  title: string;
  onTitleChange: (title: string) => void;
  backHref: string;
  backLabel: string;
  statusLabel: string;
  viewHref?: string;
  saving: boolean;
  onSaveDraft: () => void;
  onReview: () => void;
  onPublish: () => void;
  publishLabel: string;
  notices?: ReactNode;
  documentPanel: ReactNode;
}) {
  const [blocks, setBlocks] = useState<CanvasBlock[]>(() => asBlocks(initialBlocks));
  const [selected, setSelected] = useState<string | null>(blocks[0]?.id ?? null);
  const [inserter, setInserter] = useState(false);
  const [listView, setListView] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [tab, setTab] = useState<'block' | 'document'>('document');
  const [focus, setFocus] = useState(false);
  const history = useRef<CanvasBlock[][]>([]);
  const future = useRef<CanvasBlock[][]>([]);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  function commit(recipe: (current: CanvasBlock[]) => CanvasBlock[]) {
    setBlocks((current) => {
      const next = recipe(current);
      if (next === current) return current;
      history.current = [...history.current, current].slice(-40);
      future.current = [];
      return next;
    });
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setBlocks((current) => {
      future.current.push(current);
      return previous;
    });
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    setBlocks((current) => {
      history.current.push(current);
      return next;
    });
  }

  useEffect(() => {
    onChange(blocks);
  }, [blocks, onChange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && (event.shiftKey || event.metaKey) && typing && event.shiftKey) {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function insert(type: string, after: string | null = selected) {
    if (type.startsWith('pattern:')) {
      const id = type.slice('pattern:'.length);
      api<{ id: string; content: unknown[] }[]>('/modeling/patterns')
        .then((patterns) => {
          const pattern = patterns.find((item) => item.id === id);
          if (!pattern) return;
          const created = asBlocks(pattern.content);
          commit((current) => created.reduce((list, block) => insertAfter(list, after, block), current));
        })
        .catch(() => {});
      return;
    }
    const block = createBlock(type);
    rememberBlock(type);
    commit((current) => insertAfter(current, after, block));
    setSelected(block.id);
    setTab('block');
  }

  const active = selected ? findBlock(blocks, selected) : null;

  return (
    <div className={`op-gb ${focus ? 'is-focus' : ''}`}>
      <header className="op-gb-header">
        <Link className="op-gb-back" href={backHref}>
          <span className="dashicons dashicons-arrow-left-alt2" aria-hidden />
          {backLabel}
        </Link>
        <div className="op-gb-header-center">
          <button type="button" className={`op-gb-icon ${inserter ? 'is-on' : ''}`} aria-label="Toggle block inserter" aria-pressed={inserter} onClick={() => { setInserter((value) => !value); setListView(false); }}>
            <span className="dashicons dashicons-plus" />
          </button>
          <button type="button" className="op-gb-icon" aria-label="Undo" onClick={undo}>
            <span className="dashicons dashicons-undo" />
          </button>
          <button type="button" className="op-gb-icon" aria-label="Redo" onClick={redo}>
            <span className="dashicons dashicons-redo" />
          </button>
          <button type="button" className={`op-gb-icon ${listView ? 'is-on' : ''}`} aria-label="List view" aria-pressed={listView} onClick={() => { setListView((value) => !value); setInserter(false); }}>
            <span className="dashicons dashicons-list-view" />
          </button>
        </div>
        <div className="op-gb-header-end">
          <span style={{ color: '#757575' }}>{statusLabel}</span>
          {viewHref ? <a href={viewHref} target="_blank" rel="noreferrer">View</a> : null}
          <button type="button" className="op-gb-textbtn" disabled={saving} onClick={onSaveDraft}>Save draft</button>
          <button type="button" className="op-gb-textbtn" disabled={saving} onClick={onReview}>Review</button>
          <button type="button" className="op-gb-publish" disabled={saving} onClick={onPublish}>{publishLabel}</button>
          <button type="button" className={`op-gb-icon ${sidebar ? 'is-on' : ''}`} aria-label="Settings" aria-pressed={sidebar} onClick={() => setSidebar((value) => !value)}>
            <span className="dashicons dashicons-admin-generic" />
          </button>
          <button type="button" className={`op-gb-icon ${focus ? 'is-on' : ''}`} aria-label="Distraction free" aria-pressed={focus} onClick={() => setFocus((value) => !value)}>
            <span className="dashicons dashicons-editor-expand" />
          </button>
        </div>
      </header>
      {notices ? <div className="op-gb-notices">{notices}</div> : null}
      <div className="op-gb-body">
        {inserter && !focus ? (
          <Inserter onInsert={(type) => insert(type)} />
        ) : null}
        {listView && !focus ? (
          <ListView
            blocks={blocks}
            selected={selected}
            onSelect={(id) => { setSelected(id); setTab('block'); }}
            onMove={(id, direction) => commit((current) => moveSibling(current, id, direction))}
          />
        ) : null}
        <main className="op-gb-canvas" onClick={() => setSelected(null)}>
          <div className="op-gb-flow">
            <input
              className="op-gb-title"
              aria-label="Add title"
              placeholder="Add title"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
            <BlockCanvas
              blocks={blocks}
              selected={selected}
              onSelect={(id) => { setSelected(id); setTab('block'); }}
              onText={(id, text) => commit((current) => updateBlock(current, id, (block) => ({ ...block, content: [{ type: 'text', text, styles: block.content[0]?.styles ?? {} }] })))}
              onProps={(id, props) => commit((current) => updateBlock(current, id, (block) => ({ ...block, props })))}
              onMove={(id, direction) => commit((current) => moveSibling(current, id, direction))}
              onTransform={(id, type) => { rememberBlock(type); commit((current) => transformBlock(current, id, type)); }}
              onAlign={(id, align) => commit((current) => updateBlock(current, id, (block) => ({ ...block, props: { ...block.props, align } })))}
              onDuplicate={(id) => commit((current) => duplicateBlock(current, id))}
              onRemove={(id) => { commit((current) => removeBlock(current, id)); setSelected(null); }}
              onCopy={(id) => {
                const block = findBlock(blocksRef.current, id);
                if (block) void navigator.clipboard?.writeText(JSON.stringify(block));
              }}
              onGroup={(id) => commit((current) => wrapInGroup(current, id))}
              onLevel={(id, level) => commit((current) => updateBlock(current, id, (block) => ({ ...block, props: { ...block.props, level } })))}
              onInsert={(type) => insert(type)}
              onAddChild={(parentId, type) => {
                const child = createBlock(type);
                commit((current) => insertChild(current, parentId, child));
                setSelected(child.id);
              }}
              onReorder={(fromId, toId) => commit((current) => reorder(current, fromId, toId))}
            />
            <div className="op-gb-appender">
              <button type="button" className="op-gb-icon" aria-label="Add block" onClick={(event) => { event.stopPropagation(); setInserter(true); }}>
                <span className="dashicons dashicons-plus" />
              </button>
              <span>{textOf(blocks[0] ?? createBlock('paragraph')) ? '' : 'Type / to choose a block'}</span>
            </div>
          </div>
        </main>
        {sidebar && !focus ? (
          <aside className="op-gb-sidebar" aria-label="Editor settings">
            <div className="op-gb-tabs">
              <button type="button" className={tab === 'block' ? 'is-on' : ''} onClick={() => setTab('block')}>Block</button>
              <button type="button" className={tab === 'document' ? 'is-on' : ''} onClick={() => setTab('document')}>Document</button>
            </div>
            {tab === 'block' ? (
              <BlockInspector
                block={active}
                onChange={(patch) => {
                  if (!active) return;
                  commit((current) => updateBlock(current, active.id, (block) => ({ ...block, ...patch, props: patch.props ?? block.props })));
                }}
              />
            ) : (
              <div className="op-gb-doc op-gb-panel">{documentPanel}</div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
