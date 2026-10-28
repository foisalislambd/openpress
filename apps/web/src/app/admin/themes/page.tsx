'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiteSettings } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

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
    <Screen title="Themes">
      <div className="op-tablenav">
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
        <Button disabled={busy} onClick={() => fileRef.current?.click()}>
          Add New Theme
        </Button>
      </div>
      <p className="op-description mb-4">
        A theme zip needs theme.json and an optional style.css. Built-in themes live in packages/themes.
      </p>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <div key={t.id} className="op-theme-card">
            <div className="op-theme-shot">
              <span className="dashicons dashicons-admin-appearance" />
            </div>
            <div className="op-theme-meta">
              <h2>
                {t.name}
                {t.id === active ? <span className="ml-2 text-[#00a32a]">Active</span> : null}
              </h2>
              <p className="op-description">{t.description}</p>
              <p className="mt-1 text-[12px] text-[#646970]">
                By {t.author || 'Unknown'} · Version {t.version}
              </p>
              <div className="mt-3 flex gap-2">
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
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
