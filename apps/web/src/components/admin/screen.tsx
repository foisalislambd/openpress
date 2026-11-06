'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { SiteSettings } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button } from '@/components/ui';

export function Screen({
  title,
  action,
  help,
  options,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  help?: string;
  options?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  return (
    <div>
      {help || options ? (
        <div className="op-screen-meta">
          {options ? (
            <button
              type="button"
              aria-expanded={optionsOpen}
              onClick={() => {
                setOptionsOpen((value) => !value);
                setHelpOpen(false);
              }}
            >
              Screen Options
            </button>
          ) : null}
          {help ? (
            <button
              type="button"
              aria-expanded={helpOpen}
              onClick={() => {
                setHelpOpen((value) => !value);
                setOptionsOpen(false);
              }}
            >
              Help
            </button>
          ) : null}
        </div>
      ) : null}
      {optionsOpen && options ? <div className="op-screen-panel">{options}</div> : null}
      {helpOpen && help ? (
        <div className="op-screen-panel">
          <p>{help}</p>
        </div>
      ) : null}
      <h1>
        {title}
        {action ? (
          <Link className="op-title-action" href={action.href}>
            {action.label}
          </Link>
        ) : null}
      </h1>
      <hr className="op-header-end" />
      {children}
    </div>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}) {
  return (
    <div className={`op-notice is-${kind}`}>
      <p>{children}</p>
    </div>
  );
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<SiteSettings>('/settings').then(setSettings).catch(() => {});
  }, []);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await api<SiteSettings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return { settings, setSettings, save, saving, saved, error };
}

export function SettingsForm({
  title,
  children,
}: {
  title: string;
  children: (settings: SiteSettings, set: (patch: Partial<SiteSettings>) => void) => React.ReactNode;
}) {
  const { settings, setSettings, save, saving, saved, error } = useSiteSettings();
  if (!settings) return <p>Loading…</p>;
  return (
    <Screen title={title}>
      <form onSubmit={save}>
        {error ? <Notice kind="error">{error}</Notice> : null}
        {saved ? <Notice kind="success">Settings saved.</Notice> : null}
        <table className="op-form">
          <tbody>
            {children(settings, (patch) => setSettings({ ...settings, ...patch }))}
          </tbody>
        </table>
        <p>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </p>
      </form>
    </Screen>
  );
}
