'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { Badge, Button, Card } from '@/components/ui';

interface PluginItem {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  loaded: boolean;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<PluginItem[]>('/plugins').then(setPlugins).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      await api('/plugins/upload', { method: 'POST', body: fd });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function toggle(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/plugins/${id}/toggle`, { method: 'PATCH' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this plugin permanently?')) return;
    setError('');
    try {
      await api(`/plugins/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plugins</h1>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>
            Upload plugin (.zip)
          </Button>
        </div>
      </div>
      <p className="mb-6 text-sm text-zinc-500">
        A plugin is a zip with <code>plugin.json</code> and a main JS file exporting{' '}
        <code>activate(ctx)</code>. Plugins can subscribe to hooks like{' '}
        <code>content.published</code> and <code>comment.created</code>. Only install
        plugins you trust — plugin code runs on the server.
      </p>
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="space-y-4">
        {plugins.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{p.name}</h2>
                <span className="text-xs text-zinc-400">v{p.version}</span>
                {p.enabled ? (
                  <Badge color="green">Enabled</Badge>
                ) : (
                  <Badge color="zinc">Disabled</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-600">{p.description}</p>
              {p.author ? (
                <p className="mt-1 text-xs text-zinc-400">by {p.author}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => toggle(p.id)}>
                {p.enabled ? 'Disable' : 'Enable'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => remove(p.id)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
        {plugins.length === 0 ? (
          <p className="py-10 text-center text-zinc-500">
            No plugins installed. Upload a plugin zip to get started.
          </p>
        ) : null}
      </div>
    </div>
  );
}
