'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Content, Paginated, SiteSettings } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Card, Input, Label, Select, Textarea } from '@/components/ui';

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [pages, setPages] = useState<Content[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<SiteSettings>('/settings').then(setSettings).catch(() => {});
    api<Paginated<Content>>('/content?type=PAGE&status=PUBLISHED&perPage=50')
      .then((d) => setPages(d.items))
      .catch(() => {});
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
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

  if (!settings) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <form onSubmit={save} className="space-y-6">
        <Card className="space-y-4">
          <h2 className="font-semibold">General</h2>
          <div>
            <Label>Site title</Label>
            <Input
              value={settings.siteTitle}
              onChange={(e) =>
                setSettings({ ...settings, siteTitle: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Site description</Label>
            <Textarea
              rows={2}
              value={settings.siteDescription}
              onChange={(e) =>
                setSettings({ ...settings, siteDescription: e.target.value })
              }
            />
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-semibold">Reading</h2>
          <div>
            <Label>Homepage shows</Label>
            <Select
              value={settings.homepageType}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  homepageType: e.target.value as SiteSettings['homepageType'],
                })
              }
            >
              <option value="latest-posts">Latest posts</option>
              <option value="static-page">A static page</option>
            </Select>
          </div>
          {settings.homepageType === 'static-page' ? (
            <div>
              <Label>Homepage page</Label>
              <Select
                value={settings.homepageId ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, homepageId: e.target.value || null })
                }
              >
                <option value="">Select a page...</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Posts per page</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={settings.postsPerPage}
              onChange={(e) =>
                setSettings({ ...settings, postsPerPage: Number(e.target.value) })
              }
            />
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-semibold">Membership</h2>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settings.allowRegistration)}
              onChange={(e) =>
                setSettings({ ...settings, allowRegistration: e.target.checked })
              }
            />
            Anyone can register an account (new users become Authors)
          </label>
        </Card>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {saved ? <p className="text-sm text-green-600">Settings saved.</p> : null}
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </form>
    </div>
  );
}
