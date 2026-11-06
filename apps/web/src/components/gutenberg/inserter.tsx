'use client';

import { useEffect, useMemo, useState } from 'react';
import { BLOCK_CATEGORIES, getBlockTypes, type BlockDefinition } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { WpIcon } from './wp-icons';

const RECENT = 'op_recent_blocks';

export function rememberBlock(name: string) {
  const current = recentNames().filter((item) => item !== name);
  localStorage.setItem(RECENT, JSON.stringify([name, ...current].slice(0, 6)));
}

function recentNames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function Inserter({ onInsert }: { onInsert: (type: string) => void }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'blocks' | 'patterns'>('blocks');
  const [category, setCategory] = useState('all');
  const [patterns, setPatterns] = useState<{ id: string; title: string; content: unknown[] }[]>([]);
  const blocks = getBlockTypes().filter((block) => block.inserter);
  const recent = recentNames()
    .map((name) => blocks.find((block) => block.name === name))
    .filter((block): block is BlockDefinition => Boolean(block));
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      blocks.filter((block) => {
        if (!needle) return true;
        return [block.title, block.description, ...block.keywords, block.name].join(' ').toLowerCase().includes(needle);
      }),
    [blocks, needle],
  );

  useEffect(() => {
    if (tab !== 'patterns') return;
    api<{ id: string; title: string; content: unknown[] }[]>('/modeling/patterns')
      .then(setPatterns)
      .catch(() => setPatterns([]));
  }, [tab]);

  return (
    <aside className="op-gb-inserter" aria-label="Block inserter">
      <div className="op-gb-tabs">
        <button type="button" className={tab === 'blocks' ? 'is-on' : ''} onClick={() => setTab('blocks')}>Blocks</button>
        <button type="button" className={tab === 'patterns' ? 'is-on' : ''} onClick={() => setTab('patterns')}>Patterns</button>
      </div>
      <div className="op-gb-panel">
        {tab === 'patterns' ? (
          <div>
            <p style={{ color: '#757575' }}>Saved patterns on this site. The block directory is not part of this editor.</p>
            {patterns.map((pattern) => (
              <button key={pattern.id} type="button" className="op-gb-card" style={{ width: '100%', marginBottom: 8 }} onClick={() => onInsert(`pattern:${pattern.id}`)}>
                {pattern.title}
              </button>
            ))}
            {patterns.length === 0 ? <p>No saved patterns yet.</p> : null}
          </div>
        ) : (
          <>
            <input className="op-gb-search" placeholder="Search" value={query} aria-label="Search blocks" onChange={(event) => setQuery(event.target.value)} />
            {!needle ? (
              <div className="op-gb-cats" role="tablist" aria-label="Block categories">
                <button type="button" className={category === 'all' ? 'is-on' : ''} onClick={() => setCategory('all')}>All</button>
                {BLOCK_CATEGORIES.map((item) => (
                  <button key={item.name} type="button" className={category === item.name ? 'is-on' : ''} onClick={() => setCategory(item.name)}>{item.title}</button>
                ))}
              </div>
            ) : null}
            {!needle && recent.length ? (
              <>
                <p className="op-gb-cat">Recent</p>
                <div className="op-gb-grid">
                  {recent.map((block) => (
                    <BlockCard key={block.name} block={block} onInsert={onInsert} />
                  ))}
                </div>
              </>
            ) : null}
            {BLOCK_CATEGORIES.map((item) => {
              if (category !== 'all' && item.name !== category) return null;
              const items = filtered.filter((block) => block.category === item.name);
              if (!items.length) return null;
              return (
                <section key={item.name}>
                  <p className="op-gb-cat">{item.title}</p>
                  <div className="op-gb-grid">
                    {items.map((block) => (
                      <BlockCard key={block.name} block={block} onInsert={onInsert} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}

function BlockCard({ block, onInsert }: { block: BlockDefinition; onInsert: (type: string) => void }) {
  return (
    <button type="button" className="op-gb-card" onClick={() => onInsert(block.name)}>
      <WpIcon name={block.icon} />
      <span>{block.title}</span>
    </button>
  );
}

export function SlashMenu({ query, onPick }: { query: string; onPick: (type: string) => void }) {
  const needle = query.toLowerCase();
  const items = getBlockTypes()
    .filter((block) => block.inserter && block.title.toLowerCase().includes(needle))
    .slice(0, 8);
  if (!items.length) return null;
  return (
    <div className="op-gb-slash" role="listbox" aria-label="Slash inserter">
      {items.map((block) => (
        <button key={block.name} type="button" onClick={() => onPick(block.name)}>
          <WpIcon name={block.icon} /> {block.title}
        </button>
      ))}
    </div>
  );
}
