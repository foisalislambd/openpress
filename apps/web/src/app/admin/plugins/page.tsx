'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { Notice, Screen } from '@/components/admin/screen';

interface PluginItem {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  loaded: boolean;
  permissions?: string[];
  requires?: { openpress?: string };
  error?: string | null;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [view, setView] = useState<'all' | 'active' | 'inactive'>('all');
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
    <Screen
      title="Plugins"
      action={{ href: '/admin/plugins/new', label: 'Add Plugin' }}
      help="Active plugins run on the server. Deactivate one before you delete it if it is still handling a request."
    >
      <input
        ref={fileRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <p className="op-description mb-3">
        A plugin zip contains plugin.json and a main file that exports activate(ctx). Declare permissions and a core version range. Hooks are always available. Database access, admin menus, REST routes, assets, widgets, shortcodes, and blocks are not, unless the manifest lists them.
      </p>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <ul className="op-subsubsub">
        {(
          [
            ['all', 'All'],
            ['active', 'Active'],
            ['inactive', 'Inactive'],
          ] as const
        ).map(([key, label]) => {
          const count =
            key === 'active'
              ? plugins.filter((plugin) => plugin.enabled).length
              : key === 'inactive'
                ? plugins.filter((plugin) => !plugin.enabled).length
                : plugins.length;
          return (
            <li key={key}>
              <button type="button" className={view === key ? 'is-current' : undefined} onClick={() => setView(key)}>
                {label} <span className="op-status">({count})</span>
              </button>
            </li>
          );
        })}
      </ul>
      <table className="op-list">
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {plugins
            .filter((plugin) => view === 'all' || (view === 'active' ? plugin.enabled : !plugin.enabled))
            .map((p) => (
            <tr key={p.id}>
              <td>
                <span className="op-row-title">{p.name}</span>
                <div className="op-row-actions">
                  <button type="button" disabled={busy} onClick={() => toggle(p.id)}>
                    {p.enabled ? 'Deactivate' : 'Activate'}
                  </button>
                  {' | '}
                  <button type="button" className="is-delete" disabled={busy} onClick={() => remove(p.id)}>
                    Delete
                  </button>
                </div>
              </td>
              <td>
                {p.description}
                <div className="mt-1 text-[12px] text-[#646970]">
                  Version {p.version}
                  {p.author ? ` | By ${p.author}` : ''} | {p.enabled ? 'Active' : 'Inactive'}
                  {p.requires?.openpress ? ` | Requires OpenPress ${p.requires.openpress}` : ''}
                  <br />
                  Permissions: {p.permissions?.length ? p.permissions.join(', ') : 'hooks only'}
                  {p.error ? <span className="text-[#b32d2e]"> — {p.error}</span> : null}
                </div>
              </td>
            </tr>
          ))}
          {plugins.length === 0 ? (
            <tr>
              <td colSpan={2}>
                No plugins found.{' '}
                <button type="button" onClick={() => fileRef.current?.click()}>
                  Upload a plugin zip
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Screen>
  );
}
