'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client-api';
import { Button, Input, Textarea } from '@/components/ui';
import { Notice, Screen } from '@/components/admin/screen';

type Field = { key: string; label: string; type: 'text' | 'textarea' };
type Payload = {
  page: { title: string; fields: Field[] };
  values: Record<string, string>;
};

export default function PluginSettingsPage() {
  const params = useParams<{ pluginId: string; slug: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
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

  return (
    <Screen title={data?.page.title ?? 'Plugin'}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {notice ? <Notice kind="success">{notice}</Notice> : null}
      <form onSubmit={save}>
        <table className="op-form">
          <tbody>
            {data?.page.fields.map((field) => (
              <tr key={field.key}>
                <th scope="row">{field.label}</th>
                <td>
                  {field.type === 'textarea' ? (
                    <Textarea
                      rows={4}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    />
                  ) : (
                    <Input
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data ? <Button type="submit">Save Changes</Button> : null}
      </form>
    </Screen>
  );
}
