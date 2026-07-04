'use client';

import { useEffect, useState } from 'react';
import type { SiteSettings } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Badge, Button, Card } from '@/components/ui';

interface ThemeManifest {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
}

export default function ThemesPage() {
  const [themes, setThemes] = useState<ThemeManifest[]>([]);
  const [active, setActive] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/themes')
      .then((r) => r.json())
      .then(setThemes)
      .catch(() => {});
    api<SiteSettings>('/settings')
      .then((s) => setActive(s.activeTheme))
      .catch(() => {});
  }, []);

  async function activate(id: string) {
    setSaving(true);
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ activeTheme: id }),
      });
      setActive(id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Themes</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Themes are React packages under <code>packages/themes/</code>. Add your own
        by creating a package and registering it in the theme registry.
      </p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <Card key={t.id}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">{t.name}</h2>
              {t.id === active ? <Badge color="green">Active</Badge> : null}
            </div>
            <p className="mb-1 text-sm text-zinc-600">{t.description}</p>
            <p className="mb-4 text-xs text-zinc-400">
              by {t.author} &middot; v{t.version}
            </p>
            {t.id !== active ? (
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => activate(t.id)}
              >
                Activate
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
