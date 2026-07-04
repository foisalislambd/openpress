'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Category, Tag } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Card, Input, Label } from '@/components/ui';

export default function TaxonomyPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [catName, setCatName] = useState('');
  const [tagName, setTagName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Category[]>('/taxonomy/categories').then(setCategories).catch(() => {});
    api<Tag[]>('/taxonomy/tags').then(setTags).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    try {
      await api('/taxonomy/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName.trim() }),
      });
      setCatName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function addTag(e: FormEvent) {
    e.preventDefault();
    if (!tagName.trim()) return;
    try {
      await api('/taxonomy/tags', {
        method: 'POST',
        body: JSON.stringify({ name: tagName.trim() }),
      });
      setTagName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Categories &amp; Tags</h1>
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Categories</h2>
          <form onSubmit={addCategory} className="mb-4 flex gap-2">
            <div className="flex-1">
              <Label htmlFor="cat">New category</Label>
              <Input
                id="cat"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Technology"
              />
            </div>
            <Button type="submit" className="self-end">Add</Button>
          </form>
          <ul className="divide-y divide-zinc-100">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-zinc-400">
                    /{c.slug} &middot; {c._count?.contents ?? 0} posts
                  </span>
                </div>
                <button
                  onClick={async () => {
                    await api(`/taxonomy/categories/${c.id}`, { method: 'DELETE' });
                    load();
                  }}
                  className="text-xs text-zinc-500 hover:text-red-600"
                >
                  Delete
                </button>
              </li>
            ))}
            {categories.length === 0 ? (
              <li className="py-2 text-sm text-zinc-500">No categories yet.</li>
            ) : null}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Tags</h2>
          <form onSubmit={addTag} className="mb-4 flex gap-2">
            <div className="flex-1">
              <Label htmlFor="tag">New tag</Label>
              <Input
                id="tag"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="e.g. tutorial"
              />
            </div>
            <Button type="submit" className="self-end">Add</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-sm"
              >
                {t.name}
                <button
                  onClick={async () => {
                    await api(`/taxonomy/tags/${t.id}`, { method: 'DELETE' });
                    load();
                  }}
                  className="text-zinc-400 hover:text-red-600"
                  aria-label={`Delete ${t.name}`}
                >
                  &times;
                </button>
              </span>
            ))}
            {tags.length === 0 ? (
              <p className="text-sm text-zinc-500">No tags yet.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
