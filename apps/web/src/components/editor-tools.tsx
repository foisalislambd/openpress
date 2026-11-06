'use client';

import { useEffect, useState } from 'react';
import type { Media } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Input, Label } from '@/components/ui';

type Pattern = { id: string; title: string; content: unknown[]; synced: boolean };
type FieldGroup = {
  id: string;
  title: string;
  fields: { key: string; label: string; type: string; settings?: { choices?: string } }[];
};
type Translation = { id: string; locale: string; permalink: string };

export function MediaModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (media: Media) => void;
}) {
  const [items, setItems] = useState<Media[]>([]);
  useEffect(() => {
    if (!open) return;
    api<{ items: Media[] }>('/media?perPage=40')
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Media library">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-auto bg-white p-4 shadow">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg">Media library</h2>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <button key={item.id} type="button" className="border border-[#c3c4c7] p-2 text-left text-xs" onClick={() => onPick(item)}>
              {item.mimeType.startsWith('image/') || item.sizes?.thumbnail?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.mimeType.startsWith('image/') ? item.url : item.sizes?.thumbnail?.url} alt={item.alt ?? item.filename} className="mb-2 aspect-square w-full object-cover" />
              ) : null}
              <span className="line-clamp-2">{item.filename}</span>
            </button>
          ))}
        </div>
        {items.length === 0 ? <p className="op-description">The library is empty.</p> : null}
      </div>
    </div>
  );
}

export function PatternInserter({ onInsert }: { onInsert: (blocks: unknown[]) => void }) {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  useEffect(() => {
    api<Pattern[]>('/modeling/patterns').then(setPatterns).catch(() => {});
  }, []);
  if (patterns.length === 0) return null;
  return (
    <label className="block text-[13px]">
      Insert pattern
      <select
        className="mt-1 w-full border border-[#8c8f94] px-2 py-1"
        defaultValue=""
        onChange={(event) => {
          const pattern = patterns.find((item) => item.id === event.target.value);
          event.target.value = '';
          if (!pattern) return;
          if (pattern.synced) {
            onInsert([{ id: `pattern-${pattern.id}`, type: 'pattern', props: { patternId: pattern.id, title: pattern.title }, content: [], children: [] }]);
          } else {
            onInsert(pattern.content);
          }
        }}
      >
        <option value="">Choose a pattern</option>
        {patterns.map((pattern) => (
          <option key={pattern.id} value={pattern.id}>
            {pattern.title}
            {pattern.synced ? ' (synced)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FieldGroups({
  postType,
  values,
  onChange,
}: {
  postType: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  useEffect(() => {
    api<FieldGroup[]>(`/modeling/field-groups?postType=${encodeURIComponent(postType)}`)
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [postType]);
  if (groups.length === 0) return null;
  return (
    <div className="border border-[#c3c4c7] bg-white">
      <h2 className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-3 py-2">Field groups</h2>
      <div className="space-y-3 p-3">
        {groups.map((group) => (
          <div key={group.id}>
            <p className="mb-2 font-semibold">{group.title}</p>
            {group.fields.map((field) => (
              <label key={field.key} className="mb-2 block text-[13px]">
                {field.label}
                {field.type === 'textarea' ? (
                  <textarea className="mt-1 w-full border border-[#8c8f94] px-2 py-1" rows={3} value={values[field.key] ?? ''} onChange={(e) => onChange(field.key, e.target.value)} />
                ) : field.type === 'boolean' ? (
                  <input type="checkbox" className="ml-2" checked={values[field.key] === 'true'} onChange={(e) => onChange(field.key, e.target.checked ? 'true' : 'false')} />
                ) : (
                  <Input className="mt-1" type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'} value={values[field.key] ?? ''} onChange={(e) => onChange(field.key, e.target.value)} />
                )}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TranslationBox({ contentId, base = '/admin/posts' }: { contentId?: string; base?: string }) {
  const [rows, setRows] = useState<Translation[]>([]);
  const [locale, setLocale] = useState('en');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!contentId) return;
    api<{ translations?: Translation[] }>(`/content/${contentId}`)
      .then((content) => setRows(content.translations ?? []))
      .catch(() => {});
  }, [contentId]);
  if (!contentId) return null;
  return (
    <div className="border border-[#c3c4c7] bg-white">
      <h2 className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-3 py-2">Translations</h2>
      <div className="space-y-2 p-3 text-[13px]">
        {rows.map((row) => (
          <p key={row.id}>
            <a href={`${base}/${row.id}`}>{row.locale}</a>
          </p>
        ))}
        {error ? <p className="text-[#b32d2e]">{error}</p> : null}
        <Label>New locale</Label>
        <Input value={locale} onChange={(e) => setLocale(e.target.value)} />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            setError('');
            try {
              const created = await api<{ id: string }>(`/content/${contentId}/translations`, {
                method: 'POST',
                body: JSON.stringify({ locale }),
              });
              window.location.href = `${base}/${created.id}`;
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not create that translation');
            }
          }}
        >
          Add translation
        </Button>
      </div>
    </div>
  );
}
