'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { Button, Input } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

type Site = { id: string; name: string; slug: string; domain: string; status: string };

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');

  function load() {
    api<Site[]>('/sites').then(setSites).catch((err) => setError(err instanceof Error ? err.message : 'Could not load sites'));
  }

  useEffect(load, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/sites', { method: 'POST', body: JSON.stringify({ name, slug, domain }) });
      setName('');
      setSlug('');
      setDomain('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the site');
    }
  }

  return (
    <Screen title="Sites">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <p className="mb-4 text-sm text-[#646970]">
        The primary site is this install. Extra sites share users and roles. Content, media, menus, and comments stay on the site you have selected in the toolbar.
      </p>
      <table className="op-list mb-6 w-full">
        <thead>
          <tr><th>Name</th><th>Slug</th><th>Domain</th><th>Status</th></tr>
        </thead>
        <tbody>
          {sites.map((site) => (
            <tr key={site.id}>
              <td>{site.name}</td>
              <td>{site.slug}</td>
              <td>{site.domain || '—'}</td>
              <td>{site.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="op-form max-w-lg" onSubmit={create}>
        <label>Name<Input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Slug<Input value={slug} onChange={(event) => setSlug(event.target.value)} required /></label>
        <label>Domain<Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="news.example.com" /></label>
        <Button type="submit">Add site</Button>
      </form>
    </Screen>
  );
}
