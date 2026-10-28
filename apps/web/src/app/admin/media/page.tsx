'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Media } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function MediaPage() {
  const [items, setItems] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
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
      <div className="op-media-grid">
        {items.map((m) => (
          <div key={m.id} className="op-media-tile">
            {m.mimeType.startsWith('image/') ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`${API_URL}${m.url}`}
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
              <button type="button" onClick={() => navigator.clipboard.writeText(m.url)}>
                Copy URL
              </button>
              <button type="button" onClick={() => remove(m.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 ? <p>No media files found.</p> : null}
    </Screen>
  );
}
