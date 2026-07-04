'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiteSettings } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Badge, Button, Card } from '@/components/ui';

interface ThemeItem {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  builtIn: boolean;
}

export default function ThemesPage() {
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [active, setActive] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch('/api/themes')
      .then((r) => r.json())
      .then(setThemes)
      .catch(() => {});
    api<SiteSettings>('/settings')
      .then((s) => setActive(s.activeTheme))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function activate(id: string) {
    setBusy(true);
    setError('');
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ activeTheme: id }),
      });
      setActive(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      await api('/themes/upload', { method: 'POST', body: fd });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this theme?')) return;
    setError('');
    try {
      await api(`/themes/installed/${id}`, { method: 'DELETE' });
      if (active === id) await activate('default');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Themes</h1>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>
            Upload theme (.zip)
          </Button>
        </div>
      </div>
      <p className="mb-6 text-sm text-zinc-500">
        Uploaded themes use the runtime engine: a zip with <code>theme.json</code>{' '}
        (design tokens) and optional <code>style.css</code>. Code themes live in{' '}
        <code>packages/themes/</code>.
      </p>
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <Card key={t.id}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">{t.name}</h2>
              <div className="flex gap-2">
                {t.builtIn ? <Badge color="zinc">Built-in</Badge> : <Badge color="indigo">Uploaded</Badge>}
                {t.id === active ? <Badge color="green">Active</Badge> : null}
              </div>
            </div>
            <p className="mb-1 text-sm text-zinc-600">{t.description}</p>
            <p className="mb-4 text-xs text-zinc-400">
              by {t.author || 'Unknown'} &middot; v{t.version}
            </p>
            <div className="flex gap-2">
              {t.id !== active ? (
                <Button variant="secondary" disabled={busy} onClick={() => activate(t.id)}>
                  Activate
                </Button>
              ) : null}
              {!t.builtIn ? (
                <Button variant="ghost" disabled={busy} onClick={() => remove(t.id)}>
                  Delete
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
