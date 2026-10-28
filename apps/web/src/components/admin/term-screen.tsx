'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Category, Tag } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

export function TermScreen({ kind }: { kind: 'categories' | 'tags' }) {
  const [items, setItems] = useState<(Category | Tag)[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');
  const path = kind === 'categories' ? '/taxonomy/categories' : '/taxonomy/tags';
  const title = kind === 'categories' ? 'Categories' : 'Tags';
  const singular = kind === 'categories' ? 'Category' : 'Tag';

  const load = useCallback(() => {
    api<(Category | Tag)[]>(path).then(setItems).catch(() => {});
  }, [path]);

  useEffect(load, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          ...(kind === 'categories'
            ? { description: description.trim() || undefined, parentId: parentId || undefined }
            : {}),
        }),
      });
      setName('');
      setDescription('');
      setParentId('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add');
    }
  }

  const categories = items as Category[];

  return (
    <Screen title={title}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="op-split">
        <form className="op-split-form" onSubmit={add}>
          <h2>Add {singular}</h2>
          <label htmlFor="term-name">Name</label>
          <Input id="term-name" value={name} onChange={(e) => setName(e.target.value)} required />
          <p className="op-description">The name is how it appears on your site.</p>
          {kind === 'categories' ? (
            <>
              <label htmlFor="term-parent">Parent {singular}</label>
              <Select id="term-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">None</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <label htmlFor="term-desc">Description</label>
              <Textarea id="term-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
              <p className="op-description">The description is not prominent by default.</p>
            </>
          ) : null}
          <p className="mt-3">
            <Button type="submit">Add {singular}</Button>
          </p>
        </form>
        <div>
          <table className="op-list">
            <thead>
              <tr>
                <th>Name</th>
                {kind === 'categories' ? <th>Description</th> : null}
                <th>Slug</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="op-row-title">{item.name}</span>
                    <div className="op-row-actions">
                      <button
                        type="button"
                        className="is-delete"
                        onClick={async () => {
                          if (!confirm(`Delete “${item.name}”?`)) return;
                          setError('');
                          try {
                            await api(`${path}/${item.id}`, { method: 'DELETE' });
                            load();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Could not delete. Remove child categories first.',
                            );
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                  {kind === 'categories' ? <td>{(item as Category).description || '—'}</td> : null}
                  <td>{item.slug}</td>
                  <td>{item._count?.contents ?? 0}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={kind === 'categories' ? 4 : 3}>No {title.toLowerCase()} found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Screen>
  );
}
