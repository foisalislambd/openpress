'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Media } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Card } from '@/components/ui';

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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Media library</h1>
        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload files'}
          </Button>
        </div>
      </div>
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((m) => (
          <Card key={m.id} className="group relative overflow-hidden !p-0">
            {m.mimeType.startsWith('image/') ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`${API_URL}${m.url}`}
                alt={m.alt ?? m.filename}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-zinc-100 p-4 text-center text-xs text-zinc-500">
                {m.filename}
              </div>
            )}
            <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                className="text-xs font-medium text-white hover:underline"
                onClick={() => {
                  navigator.clipboard.writeText(m.url);
                }}
              >
                Copy URL
              </button>
              <button
                className="text-xs font-medium text-red-300 hover:underline"
                onClick={() => remove(m.id)}
              >
                Delete
              </button>
            </div>
          </Card>
        ))}
        {items.length === 0 ? (
          <p className="col-span-full py-10 text-center text-zinc-500">
            No media uploaded yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
