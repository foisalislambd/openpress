'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Media } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ViewId = 'all' | 'mine' | 'image' | 'audio' | 'video' | 'document' | 'other';

interface MediaList {
  items: Media[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  views: Record<ViewId, number>;
  months: { value: string; label: string; count: number }[];
  mimeTypes: { mimeType: string; count: number }[];
}

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'image', label: 'Images' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'document', label: 'Documents' },
  { id: 'other', label: 'Other' },
];

function absolute(url: string) {
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}

function previewOf(item: Media) {
  if (item.mimeType.startsWith('image/')) return absolute(item.url);
  const thumb = item.sizes?.thumbnail?.url;
  return thumb ? absolute(thumb) : '';
}

function subscribeMode(onStoreChange: () => void) {
  window.addEventListener('op-media-mode', onStoreChange);
  return () => window.removeEventListener('op-media-mode', onStoreChange);
}

function modeSnapshot() {
  return localStorage.getItem('op-media-mode') === 'list' ? 'list' : 'grid';
}

export default function MediaPage() {
  const mode = useSyncExternalStore(subscribeMode, modeSnapshot, () => 'grid');
  const [data, setData] = useState<MediaList | null>(null);
  const [selectedItem, setSelectedItem] = useState<Media | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [view, setView] = useState<ViewId>('all');
  const [mime, setMime] = useState('');
  const [month, setMonth] = useState('');
  const [monthDraft, setMonthDraft] = useState('');
  const [mimeDraft, setMimeDraft] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [bulk, setBulk] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [crop, setCrop] = useState({ x: '0', y: '0', width: '', height: '' });
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (view === 'mine') params.set('author', 'me');
    const mimeQuery = mime || (['image', 'audio', 'video', 'document', 'other'].includes(view) ? view : '');
    if (mimeQuery) params.set('mime', mimeQuery);
    if (month) params.set('month', month);
    if (search) params.set('search', search);
    void tick;
    api<MediaList>(`/media?${params}`)
      .then((next) => {
        setData(next);
        setError('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load media'));
  }, [page, perPage, view, mime, month, search, tick]);

  useEffect(load, [load]);

  useEffect(() => {
    function focusUpload() {
      if (window.location.hash !== '#upload') return;
      document.getElementById('upload')?.scrollIntoView({ block: 'center' });
    }
    function onAdminHash(event: Event) {
      if ((event as CustomEvent<string>).detail === 'upload') {
        document.getElementById('upload')?.scrollIntoView({ block: 'center' });
      }
    }
    focusUpload();
    window.addEventListener('hashchange', focusUpload);
    window.addEventListener('op-admin-hash', onAdminHash);
    return () => {
      window.removeEventListener('hashchange', focusUpload);
      window.removeEventListener('op-admin-hash', onAdminHash);
    };
  }, []);

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const allChecked = items.length > 0 && items.every((item) => checked.includes(item.id));

  function setMode(next: 'list' | 'grid') {
    localStorage.setItem('op-media-mode', next);
    window.dispatchEvent(new Event('op-media-mode'));
  }

  function choose(item: Media) {
    setSelectedItem(item);
    setAlt(item.alt ?? '');
    setCaption(item.caption ?? '');
    setCrop({ x: '0', y: '0', width: String(item.width ?? ''), height: String(item.height ?? '') });
  }

  function toggle(id: string) {
    setChecked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        await api('/media/upload', { method: 'POST', body: fd });
      }
      setNotice(files.length === 1 ? 'File uploaded.' : `${files.length} files uploaded.`);
      setPage(1);
      setTick((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(ids.length === 1 ? 'Delete this file permanently?' : `Delete ${ids.length} files permanently?`)) return;
    setError('');
    try {
      const result = await api<{ removed: string[] }>('/media/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      setChecked((current) => current.filter((id) => !result.removed.includes(id)));
      setSelectedItem((current) => (current && result.removed.includes(current.id) ? null : current));
      setNotice(result.removed.length === 1 ? 'File deleted.' : `${result.removed.length} files deleted.`);
      setTick((value) => value + 1);
    } catch (err) {
      setNotice('');
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  function applyFilters(event?: FormEvent) {
    event?.preventDefault();
    setMonth(monthDraft);
    setMime(mimeDraft);
    setSearch(searchDraft.trim());
    setPage(1);
  }

  function openView(next: ViewId) {
    setView(next);
    setMime('');
    setMimeDraft('');
    setPage(1);
    setChecked([]);
  }

  const pager = (
    <div className="op-media-pager">
      <span>
        {data?.total ?? 0} item{(data?.total ?? 0) === 1 ? '' : 's'}
      </span>
      <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
        ‹
      </button>
      <span>
        {page} of {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
        ›
      </button>
      <label>
        <span className="sr-only">Items per page</span>
        <select
          aria-label="Items per page"
          value={perPage}
          onChange={(event) => {
            setPerPage(Number(event.target.value));
            setPage(1);
          }}
        >
          {[20, 40, 60, 100].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const filters = (
    <form className="op-filters" onSubmit={applyFilters}>
      <select aria-label="Bulk actions" value={bulk} onChange={(event) => setBulk(event.target.value)}>
        <option value="">Bulk actions</option>
        <option value="delete">Delete permanently</option>
      </select>
      <Button
        variant="secondary"
        type="button"
        onClick={() => {
          if (bulk === 'delete') void remove(checked);
          setBulk('');
        }}
      >
        Apply
      </Button>
      <select aria-label="All dates" value={monthDraft} onChange={(event) => setMonthDraft(event.target.value)}>
        <option value="">All dates</option>
        {(data?.months ?? []).map((item) => (
          <option key={item.value} value={item.value}>
            {item.label} ({item.count})
          </option>
        ))}
      </select>
      <select aria-label="All media types" value={mimeDraft} onChange={(event) => setMimeDraft(event.target.value)}>
        <option value="">All media types</option>
        {(data?.mimeTypes ?? []).map((item) => (
          <option key={item.mimeType} value={item.mimeType}>
            {item.mimeType} ({item.count})
          </option>
        ))}
      </select>
      <Button variant="secondary" type="submit">
        Filter
      </Button>
      <input
        aria-label="Search media"
        value={searchDraft}
        onChange={(event) => setSearchDraft(event.target.value)}
        placeholder="Search media"
      />
    </form>
  );

  return (
    <Screen
      title="Media Library"
      action={{ href: '/admin/media/new', label: 'Add New Media File' }}
      help="Switch between list and grid. Filter by month or file type, then page through the library. Delete permanently removes the file."
    >
      <input
        ref={fileRef}
        id="upload"
        type="file"
        multiple
        accept="image/*,video/*,audio/*,application/pdf"
        className="hidden"
        onChange={(event) => upload(event.target.files)}
      />
      {notice ? <Notice kind="success">{notice}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <ul className="op-subsubsub">
        {VIEWS.filter((item) => item.id === 'all' || item.id === 'mine' || (data?.views[item.id] ?? 0) > 0).map((item) => (
          <li key={item.id}>
            <button type="button" className={view === item.id && !mime ? 'is-current' : undefined} onClick={() => openView(item.id)}>
              {item.label} <span className="count">({data?.views[item.id] ?? '…'})</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="op-tablenav">
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
        <div className="op-media-mode">
          <button type="button" className={mode === 'list' ? 'is-current' : undefined} onClick={() => setMode('list')}>
            List
          </button>
          <button type="button" className={mode === 'grid' ? 'is-current' : undefined} onClick={() => setMode('grid')}>
            Grid
          </button>
          {pager}
        </div>
      </div>
      {mode === 'list' ? (
        <table className="op-list">
          <thead>
            <tr>
              <td className="op-check">
                <input
                  type="checkbox"
                  aria-label="Select all media"
                  checked={allChecked}
                  onChange={() => setChecked(allChecked ? [] : items.map((item) => item.id))}
                />
              </td>
              <th>File</th>
              <th>Author</th>
              <th>Type</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <th className="op-check" scope="row">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.filename}`}
                    checked={checked.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                </th>
                <td>
                  <div className="op-media-file">
                    {previewOf(item) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewOf(item)} alt="" />
                    ) : (
                      <span className="dashicons dashicons-media-default" aria-hidden />
                    )}
                    <div>
                      <button type="button" className="op-row-title" onClick={() => choose(item)}>
                        {item.alt || item.filename}
                      </button>
                      <div className="op-row-actions">
                        <Link href={`/admin/media/${item.id}`}>Edit</Link>
                        <a href={absolute(item.url)} target="_blank" rel="noreferrer">
                          View
                        </a>
                        <button type="button" onClick={() => navigator.clipboard.writeText(absolute(item.url))}>
                          Copy URL
                        </button>
                        <button type="button" className="is-delete" onClick={() => remove([item.id])}>
                          Delete permanently
                        </button>
                      </div>
                    </div>
                  </div>
                </td>
                <td>{item.uploader?.name ?? '—'}</td>
                <td>{item.mimeType}</td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5}>No media files found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="op-media-grid">
            {items.map((item) => (
              <div
                key={item.id}
                className="op-media-tile"
                style={selectedItem?.id === item.id ? { outline: '2px solid #3858e9' } : undefined}
                onClick={() => choose(item)}
              >
                <input
                  className="op-media-check"
                  type="checkbox"
                  aria-label={`Select ${item.filename}`}
                  checked={checked.includes(item.id)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggle(item.id)}
                />
                {previewOf(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewOf(item)} alt={item.alt ?? item.filename} />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-[#f6f7f7] p-2 text-center text-[11px]">
                    <span className="dashicons dashicons-media-default" aria-hidden />
                    {item.filename}
                  </div>
                )}
                <div className="op-media-actions">
                  <Link href={`/admin/media/${item.id}`} onClick={(event) => event.stopPropagation()}>
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove([item.id]);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <aside className="op-postbox">
            <h2 className="px-3 py-2">Attachment details</h2>
            <div className="space-y-2 p-3 text-[13px]">
              {selectedItem ? (
                <>
                  <p className="break-all font-semibold">{selectedItem.filename}</p>
                  <p className="op-description">{selectedItem.mimeType}</p>
                  {selectedItem.width && selectedItem.height ? (
                    <p>
                      {selectedItem.width} × {selectedItem.height}
                    </p>
                  ) : null}
                  <label className="block">
                    Alternative text
                    <input className="mt-1 w-full border border-[#8c8f94] px-2 py-1" value={alt} onChange={(event) => setAlt(event.target.value)} />
                  </label>
                  <label className="block">
                    Caption
                    <input
                      className="mt-1 w-full border border-[#8c8f94] px-2 py-1"
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const updated = await api<Media>(`/media/${selectedItem.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ alt, caption }),
                      });
                      setSelectedItem(updated);
                      setTick((value) => value + 1);
                    }}
                  >
                    Save details
                  </button>
                  {selectedItem.mimeType.startsWith('image/') && selectedItem.mimeType !== 'image/svg+xml' ? (
                    <div className="space-y-1 border-t border-[#dcdcde] pt-2">
                      <p>Crop</p>
                      <div className="grid grid-cols-2 gap-1">
                        {(['x', 'y', 'width', 'height'] as const).map((key) => (
                          <input
                            key={key}
                            aria-label={key}
                            className="border border-[#8c8f94] px-1 py-0.5"
                            value={crop[key]}
                            onChange={(event) => setCrop({ ...crop, [key]: event.target.value })}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const updated = await api<Media>(`/media/${selectedItem.id}/crop`, {
                            method: 'POST',
                            body: JSON.stringify({
                              x: Number(crop.x),
                              y: Number(crop.y),
                              width: Number(crop.width),
                              height: Number(crop.height),
                            }),
                          });
                          setSelectedItem(updated);
                          setTick((value) => value + 1);
                        }}
                      >
                        Apply crop
                      </button>
                    </div>
                  ) : null}
                  <p>
                    <button type="button" className="text-[#b32d2e]" onClick={() => remove([selectedItem.id])}>
                      Delete permanently
                    </button>
                  </p>
                </>
              ) : (
                <p className="op-description">Select a file to see its details.</p>
              )}
            </div>
          </aside>
        </div>
      )}
      <div className="op-tablenav">{pager}</div>
    </Screen>
  );
}
