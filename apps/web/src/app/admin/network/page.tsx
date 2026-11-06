'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { Button, Input } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

type Site = { id: string; name: string; slug: string; domain: string; status: string };
type Membership = { siteId: string; slug: string; name: string; role: string };
type NetworkUser = { id: string; email: string; name: string; networkAdmin: boolean; sites: Membership[] };
type NetworkSettings = { networkTitle: string; allowNewSites: boolean };

export default function NetworkPage() {
  const [section, setSection] = useState('sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<NetworkUser[]>([]);
  const [settings, setSettings] = useState<NetworkSettings>({ networkTitle: '', allowNewSites: true });
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Site[]>('/sites').then(setSites).catch((err) => setError(err instanceof Error ? err.message : 'Could not load sites'));
    api<NetworkUser[]>('/network/users').then(setUsers).catch(() => {});
    api<NetworkSettings>('/network/settings').then(setSettings).catch(() => {});
  }

  useEffect(() => {
    const read = () => setSection(window.location.hash.replace('#', '') || 'sites');
    read();
    window.addEventListener('hashchange', read);
    load();
    return () => window.removeEventListener('hashchange', read);
  }, []);

  async function createSite(event: FormEvent) {
    event.preventDefault();
    setError('');
    await api('/sites', { method: 'POST', body: JSON.stringify({ name, slug, domain }) });
    setName('');
    setSlug('');
    setDomain('');
    setMessage('Site created.');
    load();
  }

  async function setStatus(site: Site, status: 'public' | 'archived') {
    await api(`/sites/${site.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setMessage(status === 'public' ? 'Site activated.' : 'Site deactivated.');
    load();
  }

  return (
    <Screen title="Network">
      {message ? <Notice kind="success">{message}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {section === 'settings' ? (
        <form
          className="op-form max-w-lg"
          onSubmit={(event) => {
            event.preventDefault();
            api('/network/settings', { method: 'PUT', body: JSON.stringify(settings) })
              .then(() => setMessage('Network settings saved.'))
              .catch((err) => setError(err instanceof Error ? err.message : 'Could not save settings'));
          }}
        >
          <label>Network title<Input value={settings.networkTitle} onChange={(event) => setSettings({ ...settings, networkTitle: event.target.value })} /></label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.allowNewSites} onChange={(event) => setSettings({ ...settings, allowNewSites: event.target.checked })} />
            Allow new sites
          </label>
          <Button type="submit">Save network settings</Button>
        </form>
      ) : null}
      {section === 'users' ? (
        <table className="op-list w-full">
          <thead>
            <tr><th>User</th><th>Network admin</th><th>Sites</th></tr>
          </thead>
          <tbody>
            {users.map((person) => (
              <tr key={person.id}>
                <td>{person.name}<div className="text-[#646970]">{person.email}</div></td>
                <td>
                  <input
                    type="checkbox"
                    checked={person.networkAdmin}
                    onChange={(event) => {
                      api(`/network/users/${person.id}`, { method: 'PUT', body: JSON.stringify({ networkAdmin: event.target.checked }) })
                        .then(load)
                        .catch((err) => setError(err instanceof Error ? err.message : 'Could not update the user'));
                    }}
                  />
                </td>
                <td>{person.sites.map((site) => `${site.name} (${site.role})`).join(', ') || 'No site'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {section === 'sites' ? (
        <>
          <table className="op-list mb-6 w-full">
            <thead>
              <tr><th>Name</th><th>Slug</th><th>Domain</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <td>{site.name}</td>
                  <td>{site.slug}</td>
                  <td>{site.domain || '—'}</td>
                  <td>{site.status}</td>
                  <td className="space-x-2">
                    {site.status === 'public' ? (
                      <button type="button" onClick={() => setStatus(site, 'archived').catch((err) => setError(err instanceof Error ? err.message : 'Could not deactivate'))}>Deactivate</button>
                    ) : (
                      <button type="button" onClick={() => setStatus(site, 'public').catch((err) => setError(err instanceof Error ? err.message : 'Could not activate'))}>Activate</button>
                    )}
                    {site.slug !== 'primary' ? (
                      <button
                        type="button"
                        className="is-delete"
                        onClick={() => {
                          if (!window.confirm(`Delete ${site.name}? Its content is removed.`)) return;
                          api(`/sites/${site.id}`, { method: 'DELETE' }).then(() => { setMessage('Site deleted.'); load(); }).catch((err) => setError(err instanceof Error ? err.message : 'Could not delete'));
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="op-form max-w-lg" onSubmit={(event) => createSite(event).catch((err) => setError(err instanceof Error ? err.message : 'Could not create the site'))}>
            <label>Name<Input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>Slug<Input value={slug} onChange={(event) => setSlug(event.target.value)} required /></label>
            <label>Domain<Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="news.example.com" /></label>
            <Button type="submit">Add site</Button>
          </form>
        </>
      ) : null}
    </Screen>
  );
}
