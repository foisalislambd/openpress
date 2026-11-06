'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client-api';
import { BlockInspector } from './block-inspector';
import { BlockCanvas } from './canvas';
import { Inserter, rememberBlock } from './inserter';
import { ListView } from './list-view';
import { WpIcon } from './wp-icons';
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
  const [more, setMore] = useState(false);
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
      if (event.key === 'Escape') {
        setInserter(false);
        setMore(false);
      }
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        setListView((value) => !value);
        setInserter(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z' && typing) {
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
        <div className="op-gb-tools" role="toolbar" aria-label="Document tools">
          <Link className="op-gb-back" href={backHref} aria-label={backLabel}>
            <WpIcon name="wordpress" />
          </Link>
          {!focus ? (
            <button
              type="button"
              className={`op-gb-plus ${inserter ? 'is-on' : ''}`}
              aria-label={inserter ? 'Close block inserter' : 'Block Inserter'}
              aria-expanded={inserter}
              onClick={() => { setInserter((value) => !value); setListView(false); }}
            >
              <WpIcon name="plus" />
            </button>
          ) : null}
          <button type="button" className="op-gb-icon" aria-label="Undo" onClick={undo}><WpIcon name="undo" /></button>
          <button type="button" className="op-gb-icon" aria-label="Redo" onClick={redo}><WpIcon name="redo" /></button>
          {!focus ? (
            <button type="button" className={`op-gb-icon ${listView ? 'is-on' : ''}`} aria-label="Document Overview" aria-pressed={listView} onClick={() => { setListView((value) => !value); setInserter(false); }}>
              <WpIcon name="list-view" />
            </button>
          ) : null}
        </div>
        <div className="op-gb-docbar" title={title || 'Untitled'}>{title || 'Untitled'}</div>
        <div className="op-gb-header-end">
          <span className="op-gb-saved">{saving ? 'Saving…' : statusLabel}</span>
          {viewHref ? (
            <a className="op-gb-icon" href={viewHref} target="_blank" rel="noreferrer" aria-label="View">
              <WpIcon name="external" />
            </a>
          ) : null}
          <button type="button" className="op-gb-publish" disabled={saving} onClick={onPublish}>{publishLabel}</button>
          <button type="button" className={`op-gb-icon ${sidebar ? 'is-on' : ''}`} aria-label="Settings" aria-pressed={sidebar} onClick={() => setSidebar((value) => !value)}>
            <WpIcon name="drawer-right" />
          </button>
          <span className="op-gb-more">
            <button type="button" className="op-gb-icon" aria-label="Options" aria-expanded={more} onClick={() => setMore((value) => !value)}>
              <WpIcon name="more-vertical" />
            </button>
            {more ? (
              <div className="op-gb-menu" role="menu">
                <button type="button" disabled={saving} onClick={() => { onSaveDraft(); setMore(false); }}>Save draft</button>
                <button type="button" disabled={saving} onClick={() => { onReview(); setMore(false); }}>Submit for review</button>
                <button type="button" onClick={() => { setFocus((value) => !value); setMore(false); }}>Distraction free</button>
              </div>
            ) : null}
          </span>
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
            {blocks.length === 0 ? (
              <button
                type="button"
                className="op-gb-placeholder"
                onClick={(event) => {
                  event.stopPropagation();
                  insert('paragraph', null);
                }}
              >
                Type / to choose a block
              </button>
            ) : (
              <div className="op-gb-appender">
                <button type="button" className="op-gb-icon" aria-label="Add block" onClick={(event) => { event.stopPropagation(); setInserter(true); setListView(false); }}>
                  <WpIcon name="plus" />
                </button>
              </div>
            )}
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
