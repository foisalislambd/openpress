'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Media } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function absolute(url: string) {
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}

function previewOf(item: Media) {
  if (item.mimeType.startsWith('image/')) return absolute(item.url);
  const thumb = item.sizes?.thumbnail?.url;
  return thumb ? absolute(thumb) : '';
}

export default function MediaPage() {
  const [items, setItems] = useState<Media[]>([]);
  const [selected, setSelected] = useState<Media | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [crop, setCrop] = useState({ x: '0', y: '0', width: '', height: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ items: Media[] }>('/media?perPage=60')
      .then((d) => setItems(d.items))
      .catch(() => {});
  }, []);

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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this file?')) return;
    await api(`/media/${id}`, { method: 'DELETE' });
    setSelected((current) => (current?.id === id ? null : current));
    load();
  }

  return (
    <Screen title="Media Library" action={{ href: '/admin/media/new', label: 'Add New Media File' }}>
      <div className="op-tablenav">
        <input
          ref={fileRef}
          id="upload"
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
        <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="op-media-grid">
        {items.map((m) => (
          <div
            key={m.id}
            className="op-media-tile"
            style={selected?.id === m.id ? { outline: '2px solid #3858e9' } : undefined}
            onClick={() => {
              setSelected(m);
              setAlt(m.alt ?? '');
              setCaption(m.caption ?? '');
              setCrop({ x: '0', y: '0', width: String(m.width ?? ''), height: String(m.height ?? '') });
            }}
          >
            {previewOf(m) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewOf(m)}
                alt={m.alt ?? m.filename}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-[#f6f7f7] p-2 text-center text-[11px]">
                <span className="dashicons dashicons-media-default" aria-hidden />
                {m.filename}
              </div>
            )}
            <div className="op-media-actions">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigator.clipboard.writeText(m.url);
                }}
              >
                Copy URL
              </button>
              <Link href={`/admin/media/${m.id}`} onClick={(event) => event.stopPropagation()}>Edit</Link>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  remove(m.id);
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
          {selected ? (
            <>
              <p className="break-all font-semibold">{selected.filename}</p>
              <p className="op-description">{selected.mimeType}</p>
              {selected.width && selected.height ? (
                <p>
                  {selected.width} × {selected.height}
                </p>
              ) : null}
              <label className="block">
                Alternative text
                <input
                  className="mt-1 w-full border border-[#8c8f94] px-2 py-1"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                />
              </label>
              <label className="block">
                Caption
                <input
                  className="mt-1 w-full border border-[#8c8f94] px-2 py-1"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={async () => {
                  const updated = await api<Media>(`/media/${selected.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ alt, caption }),
                  });
                  setSelected(updated);
                  load();
                }}
              >
                Save details
              </button>
              {selected.sizes && Object.keys(selected.sizes).length > 0 ? (
                <ul className="space-y-1">
                  {Object.entries(selected.sizes).map(([name, size]) => (
                    <li key={name}>
                      {name}: {size.width}×{size.height}
                    </li>
                  ))}
                </ul>
              ) : null}
              {selected.mimeType.startsWith('image/') && selected.mimeType !== 'image/svg+xml' ? (
                <div className="space-y-1 border-t border-[#dcdcde] pt-2">
                  <p>Crop</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(['x', 'y', 'width', 'height'] as const).map((key) => (
                      <input
                        key={key}
                        aria-label={key}
                        className="border border-[#8c8f94] px-1 py-0.5"
                        value={crop[key]}
                        onChange={(e) => setCrop({ ...crop, [key]: e.target.value })}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const updated = await api<Media>(`/media/${selected.id}/crop`, {
                        method: 'POST',
                        body: JSON.stringify({
                          x: Number(crop.x),
                          y: Number(crop.y),
                          width: Number(crop.width),
                          height: Number(crop.height),
                        }),
                      });
                      setSelected(updated);
                      load();
                    }}
                  >
                    Apply crop
                  </button>
                </div>
              ) : null}
              <p className="break-all">{selected.url}</p>
              <p>
                <button type="button" onClick={() => navigator.clipboard.writeText(selected.url)}>
                  Copy URL
                </button>
                {' | '}
                <button type="button" className="text-[#b32d2e]" onClick={() => remove(selected.id).then(() => setSelected(null))}>
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
      {items.length === 0 ? <p>No media files found.</p> : null}
    </Screen>
  );
}
