'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Content, Paginated } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Input, Select } from '@/components/ui';
import { Screen } from '@/components/admin/screen';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'TRASHED', label: 'Trash' },
];

function statusLabel(status: string) {
  if (status === 'PUBLISHED') return '';
  if (status === 'TRASHED') return 'Trash';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function when(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ContentList({ type }: { type: 'POST' | 'PAGE' }) {
  const [data, setData] = useState<Paginated<Content> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState('trash');
  const [actionError, setActionError] = useState('');
  const label = type === 'POST' ? 'Posts' : 'Pages';
  const base = type === 'POST' ? '/admin/posts' : '/admin/pages';

  const load = useCallback(() => {
    const qs = new URLSearchParams({ type, page: String(page), perPage: '20' });
    if (status) qs.set('status', status);
    if (query) qs.set('search', query);
    api<Paginated<Content>>(`/content?${qs}`)
      .then((result) => {
        setData(result);
        if (result.items.length === 0 && page > 1) setPage(page - 1);
      })
      .catch(() => {});
    setSelected([]);
    Promise.all(
      FILTERS.map(async (filter) => {
        const countQs = new URLSearchParams({ type, page: '1', perPage: '1' });
        if (filter.value) countQs.set('status', filter.value);
        const result = await api<Paginated<Content>>(`/content?${countQs}`);
        return [filter.value, result.total] as const;
      }),
    )
      .then((rows) => setCounts(Object.fromEntries(rows)))
      .catch(() => {});
  }, [type, page, status, query]);

  useEffect(load, [load]);

  useEffect(() => {
    setBulk(status === 'TRASHED' ? 'restore' : 'trash');
  }, [status]);

  async function applyBulk() {
    if (selected.length === 0) return;
    if (bulk === 'delete' && !confirm(`Delete ${selected.length} item(s) permanently?`)) return;
    setActionError('');
    const nextStatus = bulk === 'restore' ? 'DRAFT' : 'TRASHED';
    const results = await Promise.allSettled(
      selected.map((id) =>
        bulk === 'delete'
          ? api(`/content/${id}`, { method: 'DELETE' })
          : api(`/content/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: nextStatus }),
            }),
      ),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      setActionError(`${failed} of ${selected.length} item(s) could not be updated.`);
    }
    load();
  }

  function searchSubmit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  const ids = data?.items.map((item) => item.id) ?? [];
  const allOn = ids.length > 0 && ids.every((id) => selected.includes(id));

  return (
    <Screen title={label} action={{ href: `${base}/new`, label: type === 'POST' ? 'Add Post' : 'Add Page' }}>
      {actionError ? (
        <div className="op-notice is-error">
          <p>{actionError}</p>
        </div>
      ) : null}
      <ul className="op-subsubsub">
        {FILTERS.map((filter) => (
          <li key={filter.value || 'all'}>
            <button
              type="button"
              className={status === filter.value ? 'is-current' : undefined}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
            >
              {filter.label}{' '}
              <span className={status === filter.value ? '' : 'op-status'}>({counts[filter.value] ?? 0})</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="op-tablenav">
        <div className="op-bulk">
          <Select value={bulk} onChange={(e) => setBulk(e.target.value)}>
            {status === 'TRASHED' ? <option value="restore">Restore</option> : <option value="trash">Move to Trash</option>}
            <option value="delete">Delete permanently</option>
          </Select>
          <Button type="button" variant="secondary" disabled={selected.length === 0} onClick={applyBulk}>
            Apply
          </Button>
          <span>{data ? `${data.total} items` : ''}</span>
        </div>
        <form className="op-search" onSubmit={searchSubmit}>
          <Input placeholder={`Search ${label}`} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" variant="secondary">
            Search {label}
          </Button>
        </form>
      </div>
      <table className="op-list">
        <thead>
          <tr>
            <th className="op-cb">
              <input
                type="checkbox"
                checked={allOn}
                onChange={(e) => setSelected(e.target.checked ? ids : [])}
                aria-label="Select all"
              />
            </th>
            <th>Title</th>
            <th>Author</th>
            {type === 'POST' ? (
              <>
                <th>Categories</th>
                <th>Tags</th>
                <th className="op-col-comments">
                  <span className="dashicons dashicons-admin-comments" title="Comments" />
                </th>
              </>
            ) : null}
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((item) => {
            const labelText = statusLabel(item.status);
            const dateValue = item.status === 'PUBLISHED' ? item.publishedAt ?? item.updatedAt : item.updatedAt;
            return (
              <tr key={item.id}>
                <td className="op-cb">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id),
                      )
                    }
                    aria-label={`Select ${item.title}`}
                  />
                </td>
                <td>
                  <Link className="op-row-title" href={`${base}/${item.id}`}>
                    {item.title || '(no title)'}
                  </Link>
                  {labelText ? <span className="op-status"> — {labelText}</span> : null}
                  <div className="op-row-actions">
                    <Link href={`${base}/${item.id}`}>Edit</Link>
                    {' | '}
                    {item.status === 'PUBLISHED' ? (
                      <>
                        <a href={`/${item.slug}`} target="_blank" rel="noreferrer">
                          View
                        </a>
                        {' | '}
                      </>
                    ) : null}
                    {item.status === 'TRASHED' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await api(`/content/${item.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'DRAFT' }),
                          });
                          load();
                        }}
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await api(`/content/${item.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'TRASHED' }),
                          });
                          load();
                        }}
                      >
                        Trash
                      </button>
                    )}
                    {' | '}
                    <button
                      type="button"
                      className="is-delete"
                      onClick={async () => {
                        if (!confirm('Delete this item permanently?')) return;
                        await api(`/content/${item.id}`, { method: 'DELETE' });
                        load();
                      }}
                    >
                      Delete permanently
                    </button>
                  </div>
                </td>
                <td>{item.author?.name}</td>
                {type === 'POST' ? (
                  <>
                    <td>{item.categories?.map((category) => category.name).join(', ') || '—'}</td>
                    <td>{item.tags?.map((tag) => tag.name).join(', ') || '—'}</td>
                    <td className="op-col-comments">{item._count?.comments ?? 0}</td>
                  </>
                ) : null}
                <td>
                  {item.status === 'PUBLISHED' ? 'Published' : 'Last Modified'}
                  <br />
                  {when(dateValue)}
                </td>
              </tr>
            );
          })}
          {data && data.items.length === 0 ? (
            <tr>
              <td colSpan={type === 'POST' ? 7 : 4}>No {label.toLowerCase()} found.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {data && data.totalPages > 1 ? (
        <div className="op-tablenav">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹
          </Button>
          <span>
            {data.page} of {data.totalPages}
          </span>
          <Button variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            ›
          </Button>
        </div>
      ) : null}
    </Screen>
  );
}
