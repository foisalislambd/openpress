'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client-api';
import { Button, Input } from '@/components/ui';

type Inline = { type: 'text'; text: string; styles: Record<string, boolean> };
type CanvasBlock = {
  id: string;
  type: string;
  props?: Record<string, string | number | boolean>;
  content?: Inline[];
  children?: CanvasBlock[];
};

const INSERTABLE = [
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'heading', label: 'Heading' },
  { type: 'bulletListItem', label: 'List' },
  { type: 'quote', label: 'Quote' },
  { type: 'image', label: 'Image' },
  { type: 'codeBlock', label: 'Code' },
] as const;

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function textOf(block: CanvasBlock) {
  return (block.content ?? []).map((part) => part.text).join('');
}

function asBlocks(value: unknown[]): CanvasBlock[] {
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as CanvasBlock;
    if (!record.type) return [];
    return [{ ...record, id: record.id || newId(), content: Array.isArray(record.content) ? record.content : [] }];
  });
}

function blank(type: string): CanvasBlock {
  if (type === 'heading') return { id: newId(), type, props: { level: 2 }, content: [{ type: 'text', text: '', styles: {} }] };
  if (type === 'image') return { id: newId(), type, props: { url: '', caption: '' }, content: [] };
  return { id: newId(), type, content: [{ type: 'text', text: '', styles: {} }] };
}

export function BlockEditor({
  initialBlocks,
  onChange,
}: {
  initialBlocks: unknown[];
  onChange: (blocks: unknown[]) => void;
}) {
  const [blocks, setBlocks] = useState<CanvasBlock[]>(() => asBlocks(initialBlocks));
  const [selected, setSelected] = useState<string | null>(blocks[0]?.id ?? null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    onChange(blocks);
  }, [blocks, onChange]);

  const previewKey = useMemo(() => JSON.stringify(blocks), [blocks]);
  useEffect(() => {
    const handle = setTimeout(() => {
      api<{ html: string }>('/content/blocks/render', {
        method: 'POST',
        body: JSON.stringify({ blocks }),
      })
        .then((result) => {
          setHtml(result.html);
          setError('');
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Blocks were rejected'));
    }, 250);
    return () => clearTimeout(handle);
  }, [previewKey, blocks]);

  function update(id: string, patch: (block: CanvasBlock) => CanvasBlock) {
    setBlocks((current) => current.map((block) => (block.id === id ? patch(block) : block)));
  }

  function insert(type: string) {
    const block = blank(type);
    setBlocks((current) => [...current, block]);
    setSelected(block.id);
  }

  function dropOn(targetId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!dragId || dragId === targetId) return;
    setBlocks((current) => {
      const from = current.findIndex((block) => block.id === dragId);
      const onto = current.findIndex((block) => block.id === targetId);
      if (from < 0 || onto < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const nest = event.clientX - rect.left > 48;
      const destination = from < onto ? onto - 1 : onto;
      if (nest) {
        const host = next[Math.max(0, destination)];
        if (host) {
          next[Math.max(0, destination)] = { ...host, children: [...(host.children ?? []), moved] };
          return next;
        }
      }
      next.splice(destination, 0, moved);
      return next;
    });
    setDragId(null);
  }

  function onText(id: string, text: string) {
    update(id, (block) => ({ ...block, content: [{ type: 'text', text, styles: block.content?.[0]?.styles ?? {} }] }));
  }

  const active = blocks.find((block) => block.id === selected) ?? null;

  return (
    <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_240px]">
      <aside className="border border-[#c3c4c7] bg-white p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase text-[#646970]">Blocks</p>
        <div className="flex flex-col gap-1">
          {INSERTABLE.map((item) => (
            <button key={item.type} type="button" className="px-2 py-1 text-left text-[13px] hover:bg-[#f0f0f1]" onClick={() => insert(item.type)}>
              {item.label}
            </button>
          ))}
        </div>
      </aside>
      <div className="min-h-[420px] border border-[#c3c4c7] bg-white p-4">
        {blocks.length === 0 ? (
          <button type="button" className="text-[13px] text-[#2271b1]" onClick={() => insert('paragraph')}>
            Start with a paragraph
          </button>
        ) : null}
        <div className="space-y-2">
          {blocks.map((block) => (
            <article
              key={block.id}
              draggable
              onDragStart={() => setDragId(block.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropOn(block.id, event)}
              onClick={() => setSelected(block.id)}
              className={`border px-3 py-2 ${selected === block.id ? 'border-[#2271b1]' : 'border-transparent'}`}
            >
              <div className="mb-1 text-[11px] uppercase text-[#646970]">{block.type}</div>
              {block.type === 'image' ? (
                <ImageFields block={block} onChange={(props) => update(block.id, (current) => ({ ...current, props }))} />
              ) : (
                <textarea
                  className="w-full resize-y border border-[#dcdcde] p-2 text-[15px]"
                  rows={block.type === 'paragraph' ? 3 : 2}
                  value={textOf(block)}
                  onChange={(event) => onText(block.id, event.target.value)}
                />
              )}
              {(block.children ?? []).length ? (
                <ul className="ml-6 mt-2 list-disc text-[13px] text-[#646970]">
                  {(block.children ?? []).map((child) => (
                    <li key={child.id}>{child.type}: {textOf(child)}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
        {error ? <p className="mt-3 text-[13px] text-[#d63638]">{error}</p> : null}
      </div>
      <aside className="border border-[#c3c4c7] bg-white p-3 text-[13px]">
        <p className="mb-2 font-semibold">Inspector</p>
        {active?.type === 'heading' ? (
          <label className="block">
            Level
            <Input
              type="number"
              min={1}
              max={6}
              value={String(active.props?.level ?? 2)}
              onChange={(event) =>
                update(active.id, (block) => ({ ...block, props: { ...(block.props ?? {}), level: Number(event.target.value) || 2 } }))
              }
            />
          </label>
        ) : null}
        {active ? (
          <div className="mt-3 flex flex-col gap-2">
            <Button type="button" onClick={() => setBlocks((current) => current.filter((block) => block.id !== active.id))}>
              Remove block
            </Button>
            {active.children?.length ? (
              <Button
                type="button"
                onClick={() =>
                  setBlocks((current) =>
                    current.flatMap((block) =>
                      block.id === active.id ? [{ ...block, children: [] }, ...(block.children ?? [])] : [block],
                    ),
                  )
                }
              >
                Move nested blocks out
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-[#646970]">Select a block. Drag a block to reorder it. Drop it on the right side of another block to place it inside that block.</p>
        )}
        <p className="mb-1 mt-4 font-semibold">Preview</p>
        <div className="prose max-w-none text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />
      </aside>
    </div>
  );
}

function ImageFields({
  block,
  onChange,
}: {
  block: CanvasBlock;
  onChange: (props: Record<string, string | number | boolean>) => void;
}) {
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onChange({ url: String(data.get('url') ?? ''), caption: String(data.get('caption') ?? '') });
  }
  return (
    <form className="space-y-2" onSubmit={save}>
      <Input name="url" defaultValue={String(block.props?.url ?? '')} placeholder="https:// image URL" />
      <Input name="caption" defaultValue={String(block.props?.caption ?? '')} placeholder="Caption" />
      <Button type="submit">Update image</Button>
    </form>
  );
}
