'use client';

import Link from 'next/link';
import { FormEvent, Fragment, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Content, ContentStatus, Paginated, User } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Notice, Screen } from '@/components/admin/screen';
import { Button, Input, Label, Select } from '@/components/ui';

const VIEWS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'published', label: 'Published' },
  { id: 'sticky', label: 'Sticky' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'pending', label: 'Pending' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'private', label: 'Private' },
  { id: 'trash', label: 'Trash' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

interface TableMeta {
  views: Record<ViewId, number>;
  months: { value: string; label: string; count: number }[];
  categories: { slug: string; name: string; count: number }[];
}

interface Columns {
  author: boolean;
  categories: boolean;
  tags: boolean;
  comments: boolean;
  date: boolean;
}

const DEFAULT_COLUMNS: Columns = {
  author: true,
  categories: true,
  tags: true,
  comments: true,
  date: true,
};

export function ContentList({ type }: { type: 'POST' | 'PAGE' }) {
  const noun = type === 'POST' ? 'post' : 'page';
  const [items, setItems] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [perPageDraft, setPerPageDraft] = useState('20');
  const [view, setView] = useState<ViewId>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('');
  const [monthDraft, setMonthDraft] = useState('');
  const [category, setCategory] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState('');
  const [bulkStatus, setBulkStatus] = useState<ContentStatus>('DRAFT');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [columns, setColumns] = useState<Columns>(DEFAULT_COLUMNS);
  const [quick, setQuick] = useState<Content | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickSlug, setQuickSlug] = useState('');
  const [quickStatus, setQuickStatus] = useState<ContentStatus>('DRAFT');
  const [quickSticky, setQuickSticky] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  const readStored = useCallback(() => localStorage.getItem(`op-list-${type}`) ?? '', [type]);
  const stored = useSyncExternalStore(subscribeScreen, readStored, screenServerSnapshot);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    const parsed = readScreen(stored);
    setColumns(parsed.columns);
    setPerPage(parsed.perPage);
    setPerPageDraft(String(parsed.perPage));
  }

  useEffect(() => {
    api<User>('/auth/me')
      .then(setMe)
      .catch(() => {});
  }, []);

  function refreshMeta() {
    api<TableMeta>(`/content/table?type=${type}`)
      .then(setMeta)
      .catch(() => {});
  }

  useEffect(() => {
    refreshMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    if (view === 'mine' && !me) return;
    const params = new URLSearchParams({ type, page: String(page), perPage: String(perPage) });
    if (query) params.set('search', query);
    if (month) params.set('month', month);
    if (type === 'POST' && category) params.set('category', category);
    const extra = viewParams(view, me?.id);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    api<Paginated<Content>>(`/content?${params}`)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setSelected([]);
        setBulkOpen(false);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load content'));
  }, [type, view, query, page, perPage, month, category, me, tick]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allChecked = items.length > 0 && selected.length === items.length;
  const showCategories = type === 'POST' && columns.categories;
  const showTags = type === 'POST' && columns.tags;

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function runBulk(action: string) {
    if (!selected.length || !action) return;
    setError('');
    setNotice('');
    try {
      if (action === 'edit') {
        setBulkOpen(true);
        return;
      }
      if (action === 'delete') {
        await Promise.all(selected.map((id) => api(`/content/${id}`, { method: 'DELETE' })));
        setNotice(`${selected.length} ${noun}${selected.length === 1 ? '' : 's'} permanently deleted.`);
      } else if (action === 'restore') {
        await Promise.all(
          selected.map((id) =>
            api(`/content/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'DRAFT' }) }),
          ),
        );
        setNotice(`${selected.length} ${noun}${selected.length === 1 ? '' : 's'} restored from the Trash.`);
      } else {
        await Promise.all(
          selected.map((id) =>
            api(`/content/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'TRASHED' }) }),
          ),
        );
        setNotice(`${selected.length} ${noun}${selected.length === 1 ? '' : 's'} moved to the Trash.`);
      }
      setPage(1);
      setTick((value) => value + 1);
      refreshMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed');
    }
  }

  async function applyBulkEdit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await Promise.all(
        selected.map((id) =>
          api(`/content/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: bulkStatus }),
          }),
        ),
      );
      setNotice(`${selected.length} ${noun}${selected.length === 1 ? '' : 's'} updated.`);
      setBulkOpen(false);
      refreshMeta();
      setPage(1);
      setTick((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk edit failed');
    }
  }

  async function emptyTrash() {
    if (!window.confirm(`Delete all ${noun}s in the Trash permanently?`)) return;
    setError('');
    try {
      const result = await api<{ deleted: number }>(`/content/empty-trash`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      setNotice(`${result.deleted} ${noun}${result.deleted === 1 ? '' : 's'} permanently deleted.`);
      refreshMeta();
      setPage(1);
      setTick((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not empty the Trash');
    }
  }

  function openQuick(item: Content) {
    setQuick(item);
    setQuickTitle(item.title);
    setQuickSlug(item.slug);
    setQuickStatus(item.status);
    setQuickSticky(Boolean(item.sticky));
  }

  async function saveQuick(event: FormEvent) {
    event.preventDefault();
    if (!quick) return;
    setError('');
    try {
      await api(`/content/${quick.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: quickTitle,
          slug: quickSlug,
          status: quickStatus,
          ...(type === 'POST' ? { sticky: quickSticky } : {}),
        }),
      });
      setNotice('Updated.');
      setQuick(null);
      refreshMeta();
      setTick((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick edit failed');
    }
  }

  function finishRow(message: string) {
    setError('');
    setNotice(message);
    refreshMeta();
    setPage(1);
    setTick((value) => value + 1);
  }

  function failRow(err: unknown) {
    setNotice('');
    setError(err instanceof Error ? err.message : 'Could not update the row');
  }

  function saveScreen(event: FormEvent) {
    event.preventDefault();
    const next = Math.min(100, Math.max(1, Number(perPageDraft) || 20));
    setPerPage(next);
    setPerPageDraft(String(next));
    setPage(1);
    localStorage.setItem(`op-list-${type}`, JSON.stringify({ columns, perPage: next }));
  }

  function applyFilters() {
    setMonth(monthDraft);
    setCategory(categoryDraft);
    setPage(1);
  }

  const visibleViews = VIEWS.filter((item) => {
    if (item.id === 'sticky' && type !== 'POST') return false;
    if (item.id === 'all') return true;
    if (item.id === 'mine' && meta && meta.views.mine === meta.views.all) return false;
    return (meta?.views[item.id] ?? 0) > 0;
  });

  const toolbar = (position: 'top' | 'bottom') => (
    <div className="op-tablenav">
      <div className="op-filters">
        <select aria-label="Bulk actions" value={bulk} onChange={(event) => setBulk(event.target.value)}>
          <option value="">Bulk actions</option>
          {view === 'trash' ? (
            <>
              <option value="restore">Restore</option>
              <option value="delete">Delete permanently</option>
            </>
          ) : (
            <>
              <option value="edit">Bulk edit</option>
              <option value="trash">Move to Trash</option>
            </>
          )}
        </select>
        <Button variant="secondary" onClick={() => runBulk(bulk)}>
          Apply
        </Button>
        {position === 'top' && view !== 'trash' ? (
          <>
            <select aria-label="All dates" value={monthDraft} onChange={(event) => setMonthDraft(event.target.value)}>
              <option value="">All dates</option>
              {(meta?.months ?? []).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} ({item.count})
                </option>
              ))}
            </select>
            {type === 'POST' ? (
              <select
                aria-label="All categories"
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
              >
                <option value="">All categories</option>
                {(meta?.categories ?? []).map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            ) : null}
            <Button variant="secondary" onClick={applyFilters}>
              Filter
            </Button>
          </>
        ) : null}
        {position === 'top' && view === 'trash' && total > 0 ? (
          <Button variant="secondary" onClick={emptyTrash}>
            Empty Trash
          </Button>
        ) : null}
      </div>
      <div className="op-filters">
        {position === 'top' ? (
          <form
            className="op-search"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(search);
            }}
          >
            <input
              aria-label={`Search ${noun}s`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" type="submit">
              Search {noun}s
            </Button>
          </form>
        ) : null}
        <span className="op-displaying">
          {total} item{total === 1 ? '' : 's'}
        </span>
        {totalPages > 1 ? (
          <span className="op-paging">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              ‹
            </button>
            <span>
              {page} of {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
              ›
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <Screen
      title={type === 'POST' ? 'Posts' : 'Pages'}
      action={{ href: `/admin/${noun}s/new`, label: `Add ${noun === 'post' ? 'Post' : 'Page'}` }}
      help="Filter by date, category, and author. Quick Edit changes the title, slug, and status without leaving the list. Trash is separate from All. Screen Options chooses columns and how many rows to show."
      options={
        <form className="op-screen-options" onSubmit={saveScreen}>
          <fieldset>
            <legend>Columns</legend>
            <label>
              <input
                type="checkbox"
                checked={columns.author}
                onChange={(event) => setColumns({ ...columns, author: event.target.checked })}
              />
              Author
            </label>
            {type === 'POST' ? (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={columns.categories}
                    onChange={(event) => setColumns({ ...columns, categories: event.target.checked })}
                  />
                  Categories
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={columns.tags}
                    onChange={(event) => setColumns({ ...columns, tags: event.target.checked })}
                  />
                  Tags
                </label>
              </>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={columns.comments}
                onChange={(event) => setColumns({ ...columns, comments: event.target.checked })}
              />
              Comments
            </label>
            <label>
              <input
                type="checkbox"
                checked={columns.date}
                onChange={(event) => setColumns({ ...columns, date: event.target.checked })}
              />
              Date
            </label>
          </fieldset>
          <div>
            <Label htmlFor="op-per-page">Number of items per page</Label>
            <Input
              id="op-per-page"
              value={perPageDraft}
              onChange={(event) => setPerPageDraft(event.target.value)}
            />
          </div>
          <Button type="submit">Apply</Button>
        </form>
      }
    >
      {notice ? <Notice kind="success">{notice}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <ul className="op-subsubsub">
        {visibleViews.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={view === item.id ? 'is-current' : undefined}
              onClick={() => {
                setView(item.id);
                setPage(1);
                setQuick(null);
                setBulk('');
              }}
            >
              {item.label} <span className="count">({meta?.views[item.id] ?? '…'})</span>
            </button>
          </li>
        ))}
      </ul>
      {toolbar('top')}
      {bulkOpen ? (
        <form className="op-inline-edit" onSubmit={applyBulkEdit}>
          <div>
            <Label htmlFor="op-bulk-status">Status</Label>
            <select
              id="op-bulk-status"
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value as ContentStatus)}
            >
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending</option>
              <option value="SCHEDULED">Scheduled</option>
            </select>
          </div>
          <div className="op-inline-actions">
            <Button type="submit">Update</Button>
            <Button variant="secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <table className="op-list">
        <thead>
          <tr>
            <td className="op-check">
              <input
                type="checkbox"
                aria-label={`Select all ${noun}s`}
                checked={allChecked}
                onChange={() => setSelected(allChecked ? [] : items.map((item) => item.id))}
              />
            </td>
            <th>Title</th>
            {columns.author ? <th>Author</th> : null}
            {showCategories ? <th>Categories</th> : null}
            {showTags ? <th>Tags</th> : null}
            {columns.comments ? <th className="op-col-comments">Comments</th> : null}
            {columns.date ? <th>Date</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <tr>
                <th className="op-check" scope="row">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.title}`}
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                </th>
                <td>
                  <strong>
                    <Link href={`/admin/${noun}s/${item.id}`}>{item.title}</Link>
                  </strong>
                  {item.sticky ? <span> — Sticky</span> : null}
                  {item.status !== 'PUBLISHED' ? (
                    <span className="op-status"> — {labelStatus(item.status)}</span>
                  ) : null}
                  {item.visibility === 'PRIVATE' ? <span className="op-status"> — Private</span> : null}
                  <div className="op-row-actions">
                    {view !== 'trash' ? (
                      <>
                        <Link href={`/admin/${noun}s/${item.id}`}>Edit</Link>
                        <button type="button" onClick={() => openQuick(item)}>
                          Quick Edit
                        </button>
                        <button
                          type="button"
                          className="is-delete"
                          onClick={() => {
                            void api(`/content/${item.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'TRASHED' }),
                            })
                              .then(() => finishRow(`1 ${noun} moved to the Trash.`))
                              .catch(failRow);
                          }}
                        >
                          Trash
                        </button>
                        {item.status === 'PUBLISHED' ? (
                          <Link href={item.permalink ?? `/${item.slug}`}>View</Link>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            void api(`/content/${item.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'DRAFT' }),
                            })
                              .then(() => finishRow(`1 ${noun} restored from the Trash.`))
                              .catch(failRow);
                          }}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="is-delete"
                          onClick={() => {
                            void api(`/content/${item.id}`, { method: 'DELETE' })
                              .then(() => finishRow(`1 ${noun} permanently deleted.`))
                              .catch(failRow);
                          }}
                        >
                          Delete Permanently
                        </button>
                      </>
                    )}
                  </div>
                </td>
                {columns.author ? <td>{item.author?.name ?? '—'}</td> : null}
                {showCategories ? <td>{item.categories?.map((c) => c.name).join(', ') || '—'}</td> : null}
                {showTags ? <td>{item.tags?.map((t) => t.name).join(', ') || '—'}</td> : null}
                {columns.comments ? <td className="op-col-comments">{item._count?.comments ?? 0}</td> : null}
                {columns.date ? (
                  <td>
                    {dateVerb(item)}
                    <br />
                    {formatWhen(item.status === 'PUBLISHED' && item.publishedAt ? item.publishedAt : item.updatedAt)}
                  </td>
                ) : null}
              </tr>
              {quick?.id === item.id ? (
                <tr className="is-inline">
                  <td colSpan={1 + columnCount(columns, type)}>
                    <form className="op-inline-edit" onSubmit={saveQuick}>
                      <div>
                        <Label htmlFor="op-quick-title">Title</Label>
                        <Input id="op-quick-title" value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="op-quick-slug">Slug</Label>
                        <Input id="op-quick-slug" value={quickSlug} onChange={(event) => setQuickSlug(event.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="op-quick-status">Status</Label>
                        <Select
                          id="op-quick-status"
                          value={quickStatus}
                          onChange={(event) => setQuickStatus(event.target.value as ContentStatus)}
                        >
                          <option value="PUBLISHED">Published</option>
                          <option value="DRAFT">Draft</option>
                          <option value="PENDING">Pending Review</option>
                          <option value="SCHEDULED">Scheduled</option>
                        </Select>
                      </div>
                      {type === 'POST' ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={quickSticky}
                            onChange={(event) => setQuickSticky(event.target.checked)}
                          />{' '}
                          Stick this post to the front page
                        </label>
                      ) : null}
                      <div className="op-inline-actions">
                        <Button type="submit">Update</Button>
                        <Button variant="secondary" onClick={() => setQuick(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {!items.length ? (
            <tr>
              <td colSpan={1 + columnCount(columns, type)}>No {noun}s found.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {toolbar('bottom')}
    </Screen>
  );
}

function subscribeScreen() {
  return () => {};
}

function screenServerSnapshot() {
  return '';
}

function readScreen(raw: string) {
  if (!raw) return { columns: DEFAULT_COLUMNS, perPage: 20 };
  try {
    const saved = JSON.parse(raw) as { columns?: Columns; perPage?: number };
    const perPage = saved.perPage && saved.perPage > 0 && saved.perPage <= 100 ? saved.perPage : 20;
    return { columns: { ...DEFAULT_COLUMNS, ...saved.columns }, perPage };
  } catch {
    return { columns: DEFAULT_COLUMNS, perPage: 20 };
  }
}

function viewParams(view: ViewId, authorId?: string) {
  if (view === 'mine') return authorId ? { authorId } : {};
  if (view === 'sticky') return { sticky: 'only' };
  if (view === 'published') return { status: 'PUBLISHED', visibility: 'PUBLIC,PASSWORD' };
  if (view === 'drafts') return { status: 'DRAFT' };
  if (view === 'pending') return { status: 'PENDING' };
  if (view === 'scheduled') return { status: 'SCHEDULED' };
  if (view === 'private') return { status: 'PUBLISHED', visibility: 'PRIVATE' };
  if (view === 'trash') return { status: 'TRASHED' };
  return {};
}

function labelStatus(status: ContentStatus) {
  if (status === 'PENDING') return 'Pending';
  if (status === 'SCHEDULED') return 'Scheduled';
  if (status === 'TRASHED') return 'Trash';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function dateVerb(item: Content) {
  if (item.status === 'PUBLISHED') return 'Published';
  if (item.status === 'SCHEDULED') return 'Scheduled';
  return 'Last Modified';
}

function formatWhen(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${y}/${m}/${d} at ${hours}:${minutes} ${suffix}`;
}

function columnCount(columns: Columns, type: 'POST' | 'PAGE') {
  return (
    1 +
    (columns.author ? 1 : 0) +
    (type === 'POST' && columns.categories ? 1 : 0) +
    (type === 'POST' && columns.tags ? 1 : 0) +
    (columns.comments ? 1 : 0) +
    (columns.date ? 1 : 0)
  );
}
