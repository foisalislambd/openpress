'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client-api';
import { Button, Input, Textarea } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

type Field = { key: string; label: string; type: 'text' | 'textarea' };
type Column = { key: string; label: string };
type Page = {
  title: string;
  fields: Field[];
  screen?: 'form' | 'list' | 'content' | 'html';
  collection?: string;
  postType?: string;
  columns?: Column[];
  html?: string;
};
type Payload = { page: Page; values: Record<string, string> };
type RecordRow = { id: string; data: Record<string, unknown> };
type ContentRow = { id: string; title: string; status: string; slug: string };

export default function PluginSettingsPage() {
  const params = useParams<{ pluginId: string; slug: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [title, setTitle] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.pluginId || !params.slug) return;
    api<Payload>(`/plugins/${params.pluginId}/settings/${params.slug}`)
      .then((loaded) => {
        setData(loaded);
        const next: Record<string, string> = {};
        for (const field of loaded.page.fields) next[field.key] = String(loaded.values[field.key] ?? '');
        setValues(next);
        if (loaded.page.screen === 'list' && loaded.page.collection) {
          return api<RecordRow[]>(`/plugins/${params.pluginId}/collections/${loaded.page.collection}`).then(setRows);
        }
        if (loaded.page.screen === 'content') {
          const type = loaded.page.postType ? `?postType=${encodeURIComponent(loaded.page.postType)}` : '';
          return api<ContentRow[]>(`/plugins/${params.pluginId}/content${type}`).then(setContent);
        }
        return undefined;
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this page'));
  }, [params.pluginId, params.slug]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    setError('');
    try {
      await api(`/plugins/${params.pluginId}/settings/${params.slug}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      setNotice('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    }
  }

  async function createContent(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api(`/plugins/${params.pluginId}/content`, {
        method: 'POST',
        body: JSON.stringify({ title, postType: data?.page.postType }),
      });
      setTitle('');
      const type = data?.page.postType ? `?postType=${encodeURIComponent(data.page.postType)}` : '';
      setContent(await api<ContentRow[]>(`/plugins/${params.pluginId}/content${type}`));
      setNotice('Draft created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that item');
    }
  }

  const page = data?.page;
  return (
    <Screen title={page?.title ?? 'Plugin'}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {notice ? <Notice kind="success">{notice}</Notice> : null}
      {page?.screen === 'html' ? (
        <iframe className="min-h-80 w-full border border-[#c3c4c7] bg-white" sandbox="" title={page.title} srcDoc={page.html || ''} />
      ) : null}
      {page?.screen === 'list' ? (
        <table className="op-list">
          <thead>
            <tr>
              {(page.columns ?? []).map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {(page.columns ?? []).map((column) => (
                  <td key={column.key}>{String(row.data?.[column.key] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {page?.screen === 'content' ? (
        <>
          <form onSubmit={createContent} className="mb-4 flex gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
            <Button type="submit">Add draft</Button>
          </form>
          <table className="op-list">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {content.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/admin/posts/${row.id}`}>{row.title}</Link>
                  </td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {!page || page.screen === 'form' || !page.screen ? (
        <form onSubmit={save}>
          <table className="op-form">
            <tbody>
              {page?.fields.map((field) => (
                <tr key={field.key}>
                  <th scope="row">{field.label}</th>
                  <td>
                    {field.type === 'textarea' ? (
                      <Textarea rows={4} value={values[field.key] ?? ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
                    ) : (
                      <Input value={values[field.key] ?? ''} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {page ? <Button type="submit">Save Changes</Button> : null}
        </form>
      ) : null}
    </Screen>
  );
}
