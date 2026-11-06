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
  dependencies?: string[];
  allowedHosts?: string[];
  sandbox?: boolean;
  canRollback?: boolean;
  error?: string | null;
}

interface StagedPlugin {
  token: string;
  hash: string;
  signatureStatus: 'trusted' | 'unsigned' | 'invalid';
  permissions: string[];
  allowedHosts: string[];
  requires?: { openpress?: string };
  manifest: { id: string; name: string; version: string; description?: string };
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [view, setView] = useState<'all' | 'active' | 'inactive'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<StagedPlugin | null>(null);
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
      const staged = await api<StagedPlugin>('/plugins/stage', { method: 'POST', body: fd });
      setReview(staged);
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
        A plugin zip contains plugin.json and a main file that exports activate(ctx). Uploads stop on a permission review before anything is installed. Each plugin then runs in its own process; content, storage, email, and network calls work only when the manifest declares them.
      </p>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {review ? (
        <div className="op-postbox mb-4">
          <h2 className="px-3 py-2">Review {review.manifest.name}</h2>
          <div className="space-y-2 p-3 text-[13px]">
            <p>
              Version {review.manifest.version}. Signature: {review.signatureStatus}. Package hash {review.hash.slice(0, 12)}.
            </p>
            <p>Permissions: {review.permissions.length ? review.permissions.join(', ') : 'hooks only'}</p>
            <p>Allowed hosts: {review.allowedHosts.length ? review.allowedHosts.join(', ') : 'none'}</p>
            <p>The plugin runs in a separate process. These permissions are the only host APIs it can call.</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="border border-[#3858e9] bg-[#3858e9] px-3 py-1 text-white"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/plugins/stage/${review.token}/commit`, { method: 'POST' });
                    setReview(null);
                    load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Install failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Install
              </button>
              <button type="button" onClick={() => setReview(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
                  {p.canRollback ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError('');
                          try {
                            await api(`/plugins/${p.id}/rollback`, { method: 'POST' });
                            load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Rollback failed');
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Rollback
                      </button>
                      {' | '}
                    </>
                  ) : null}
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
                  {p.dependencies?.length ? ` | Depends on ${p.dependencies.join(', ')}` : ''}
                  <br />
                  Sandbox: {p.sandbox ? 'isolated process' : 'off'}
                  {' | '}
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
