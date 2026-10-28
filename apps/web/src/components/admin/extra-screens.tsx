'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { Category, Content, Paginated, SiteSettings, User } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Input, Label, Select, Textarea } from '@/components/ui';
import { Notice, Screen, SettingsForm } from '@/components/admin/screen';

function field(label: string, control: React.ReactNode, hint?: string) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        {control}
        {hint ? <p className="op-description">{hint}</p> : null}
      </td>
    </tr>
  );
}

export function UpdatesScreen() {
  return (
    <Screen title="Updates">
      <h2 className="mb-2">OpenPress</h2>
      <table className="op-list mb-6">
        <tbody>
          <tr>
            <td>
              <strong>OpenPress 0.1.0</strong>
              <p className="op-description">You have the latest version of OpenPress.</p>
            </td>
          </tr>
        </tbody>
      </table>
      <h2 className="mb-2">Plugins</h2>
      <Notice kind="success">Your plugins are all up to date.</Notice>
      <p>
        New plugins are installed from a zip on <Link href="/admin/plugins/new">Add Plugin</Link>.
      </p>
      <h2 className="mb-2 mt-4">Themes</h2>
      <Notice kind="success">Your themes are all up to date.</Notice>
    </Screen>
  );
}

export function CustomizeScreen() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<SiteSettings>('/settings').then(setSettings).catch(() => {});
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    await api('/settings', { method: 'PUT', body: JSON.stringify(settings) });
    setSaved(true);
  }

  return (
    <Screen title="Customize">
      <div className="grid min-h-[70vh] gap-0 border border-[#c3c4c7] lg:grid-cols-[300px_minmax(0,1fr)]">
        <form onSubmit={save} className="border-b border-[#c3c4c7] bg-[#eee] p-3 lg:border-b-0 lg:border-r">
          <h2 className="mb-3">Site Identity</h2>
          <Label>Site title</Label>
          <Input
            className="mb-3"
            value={settings?.siteTitle ?? ''}
            onChange={(e) => settings && setSettings({ ...settings, siteTitle: e.target.value })}
          />
          <Label>Tagline</Label>
          <Textarea
            className="mb-3"
            rows={3}
            value={settings?.siteDescription ?? ''}
            onChange={(e) =>
              settings && setSettings({ ...settings, siteDescription: e.target.value })
            }
          />
          {saved ? <Notice kind="success">Saved. The preview reloads published content.</Notice> : null}
          <Button type="submit">Publish</Button>
        </form>
        <iframe title="Site preview" src="/" className="h-[70vh] w-full bg-white" />
      </div>
    </Screen>
  );
}

type MenuItem = { label: string; url: string };
type NavMenu = { name: string; items: MenuItem[] };

export function MenusScreen() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [name, setName] = useState('Primary');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('/');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<SiteSettings>('/settings')
      .then((loaded) => {
        setSettings(loaded);
        const stored = Array.isArray(loaded.menus) ? (loaded.menus as NavMenu[]) : [];
        if (stored[0]?.name) setName(stored[0].name);
      })
      .catch(() => {});
  }, []);

  const menus = (Array.isArray(settings?.menus) ? settings.menus : []) as NavMenu[];
  const current = menus[0] ?? { name, items: [] as MenuItem[] };

  async function persist(next: NavMenu) {
    if (!settings) return;
    const updated = await api<SiteSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ ...settings, menus: [next] }),
    });
    setSettings(updated);
    setName(next.name);
    setSaved(true);
  }

  return (
    <Screen title="Menus">
      {saved ? <Notice kind="success">Menu saved.</Notice> : null}
      <table className="op-form">
        <tbody>
          {field(
            'Menu name',
            <Input value={name} onChange={(e) => setName(e.target.value)} />,
          )}
          {field(
            'Add item',
            <div className="flex gap-2">
              <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
              <Input placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button
                type="button"
                onClick={async () => {
                  if (!label.trim() || !settings) return;
                  await persist({
                    name: name.trim() || 'Primary',
                    items: [...current.items, { label: label.trim(), url: url.trim() || '/' }],
                  });
                  setLabel('');
                }}
              >
                Add to menu
              </Button>
            </div>,
          )}
        </tbody>
      </table>
      <table className="op-list mt-4">
        <thead>
          <tr>
            <th>Label</th>
            <th>URL</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {current.items.map((item, index) => (
            <tr key={`${item.url}-${index}`}>
              <td>{item.label}</td>
              <td>{item.url}</td>
              <td>
                <button
                  type="button"
                  className="is-delete"
                  onClick={() =>
                    persist({
                      name: name.trim() || 'Primary',
                      items: current.items.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {current.items.length === 0 ? (
            <tr>
              <td colSpan={3}>No items yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Screen>
  );
}

export function FileEditorDisabled({ kind }: { kind: 'theme' | 'plugin' }) {
  return (
    <Screen title={kind === 'theme' ? 'Theme File Editor' : 'Plugin File Editor'}>
      <Notice kind="error">
        File editing is disabled. Themes and plugins are installed from zip files, the same way
        WordPress behaves when DISALLOW_FILE_EDIT is set.
      </Notice>
    </Screen>
  );
}

export function AddMediaScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(0);
  const [over, setOver] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        await api('/media/upload', { method: 'POST', body });
      }
      setDone(files.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Upload New Media">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {done > 0 ? (
        <Notice kind="success">
          {done} file{done === 1 ? '' : 's'} uploaded. <Link href="/admin/media">Media Library</Link>
        </Notice>
      ) : null}
      <div
        className={over ? 'op-dropzone is-over' : 'op-dropzone'}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          upload(event.dataTransfer.files);
        }}
      >
        <p>{busy ? 'Uploading…' : 'Drop files to upload'}</p>
        <p className="op-description">or</p>
        <label className="op-title-action" style={{ cursor: 'pointer' }}>
          Select Files
          <input
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            disabled={busy}
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
        <p className="op-description">Maximum upload file size: 25 MB. Images, video, and PDF.</p>
      </div>
    </Screen>
  );
}

export function AddPluginScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file);
      await api('/plugins/upload', { method: 'POST', body });
      setMessage('Plugin installed and enabled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Add Plugins">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {message ? (
        <Notice kind="success">
          {message} <Link href="/admin/plugins">Installed Plugins</Link>
        </Notice>
      ) : null}
      <div className="op-postbox max-w-xl">
        <h2 className="px-3 py-2">Upload Plugin</h2>
        <div className="space-y-3 p-3">
          <p>If you have a plugin in a .zip format, you may install it by uploading it here.</p>
          <input type="file" accept=".zip" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          <p className="op-description">{busy ? 'Installing…' : 'Choose a .zip file to install it.'}</p>
        </div>
      </div>
    </Screen>
  );
}

export function ProfileScreen() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<User>('/auth/me').then((user) => {
      setName(user.name);
      setBio(user.bio ?? '');
      setEmail(user.email);
    }).catch(() => {});
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaved(false);
    try {
      await api('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          bio,
          ...(password ? { password } : {}),
        }),
      });
      setPassword('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    }
  }

  return (
    <Screen title="Profile">
      <form onSubmit={save}>
        {error ? <Notice kind="error">{error}</Notice> : null}
        {saved ? <Notice kind="success">Profile updated.</Notice> : null}
        <table className="op-form">
          <tbody>
            {field('Email', <Input value={email} disabled />)}
            {field('Name', <Input value={name} onChange={(e) => setName(e.target.value)} required />)}
            {field('Biographical info', <Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />)}
            {field(
              'New password',
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />,
              'Leave blank to keep the current password.',
            )}
          </tbody>
        </table>
        <Button type="submit">Update Profile</Button>
      </form>
    </Screen>
  );
}

export function AddUserScreen() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'AUTHOR' });
  useEffect(() => {
    api<SiteSettings>('/settings')
      .then((settings) => {
        const role = String(settings.defaultRole ?? 'AUTHOR');
        if (role === 'ADMIN' || role === 'EDITOR' || role === 'AUTHOR') {
          setForm((current) => ({ ...current, role }));
        }
      })
      .catch(() => {});
  }, []);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      setDone(true);
      setForm({ name: '', email: '', password: '', role: 'AUTHOR' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  }

  return (
    <Screen title="Add User">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {done ? (
        <Notice kind="success">
          User created. <Link href="/admin/users">All Users</Link>
        </Notice>
      ) : null}
      <form onSubmit={create}>
        <table className="op-form">
          <tbody>
            {field('Name', <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />)}
            {field('Email', <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />)}
            {field('Password', <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />)}
            {field(
              'Role',
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="ADMIN">Administrator</option>
                <option value="EDITOR">Editor</option>
                <option value="AUTHOR">Author</option>
              </Select>,
            )}
          </tbody>
        </table>
        <Button type="submit">Add User</Button>
      </form>
    </Screen>
  );
}

export function ToolsScreen() {
  return (
    <Screen title="Tools">
      <table className="op-list">
        <tbody>
          <tr>
            <td>
              <Link href="/admin/tools/import">Import</Link>
              <p className="op-description">Bring posts in from a JSON export.</p>
            </td>
          </tr>
          <tr>
            <td>
              <Link href="/admin/tools/export">Export</Link>
              <p className="op-description">Download posts and pages as JSON.</p>
            </td>
          </tr>
          <tr>
            <td>
              <Link href="/admin/tools/site-health">Site Health</Link>
              <p className="op-description">Check that the API and site settings respond.</p>
            </td>
          </tr>
        </tbody>
      </table>
    </Screen>
  );
}

export function ImportScreen() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setMessage('');
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { posts?: { title: string; excerpt?: string; status?: string; type?: string }[] };
      const posts = Array.isArray(data.posts) ? data.posts : [];
      let imported = 0;
      for (const post of posts) {
        if (!post?.title?.trim()) continue;
        await api('/content', {
          method: 'POST',
          body: JSON.stringify({
            title: post.title.trim(),
            excerpt: post.excerpt,
            status: post.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
            type: post.type === 'PAGE' ? 'PAGE' : 'POST',
          }),
        });
        imported += 1;
      }
      setMessage(`Imported ${imported} item${imported === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <Screen title="Import">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {message ? <Notice kind="success">{message}</Notice> : null}
      <p>Upload an OpenPress export (.json). Each item becomes a draft unless its status is PUBLISHED.</p>
      <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
    </Screen>
  );
}

export function ExportScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      async function collect(type: 'POST' | 'PAGE') {
        const items: Content[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const batch = await api<Paginated<Content>>(
            `/content?type=${type}&perPage=50&page=${page}`,
          );
          items.push(...batch.items);
          totalPages = batch.totalPages;
          page += 1;
        } while (page <= totalPages);
        return items;
      }
      const posts = await collect('POST');
      const pages = await collect('PAGE');
      const blob = new Blob(
        [JSON.stringify({ posts: [...posts, ...pages] }, null, 2)],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'openpress-export.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Export">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <p>Download posts and pages as JSON. The file can be imported on another OpenPress site.</p>
      <Button type="button" disabled={busy} onClick={download}>
        {busy ? 'Preparing…' : 'Download Export File'}
      </Button>
    </Screen>
  );
}

export function SiteHealthScreen() {
  const [rows, setRows] = useState<{ label: string; ok: boolean; detail: string }[]>([]);

  useEffect(() => {
    Promise.allSettled([api('/auth/me'), api('/settings')]).then((results) => {
      setRows([
        {
          label: 'Signed-in session',
          ok: results[0].status === 'fulfilled',
          detail: results[0].status === 'fulfilled' ? 'API accepted the session.' : 'Session check failed.',
        },
        {
          label: 'Site settings',
          ok: results[1].status === 'fulfilled',
          detail: results[1].status === 'fulfilled' ? 'Settings loaded.' : 'Settings request failed.',
        },
      ]);
    });
  }, []);

  const ready = rows.length > 0;
  const critical = ready && rows.some((row) => !row.ok);
  return (
    <Screen title="Site Health">
      <div className="op-health">
        <div className={critical ? 'op-health-mark is-bad' : 'op-health-mark'}>{critical ? '!' : ready ? 'Good' : '…'}</div>
        <div>
          <h2>{!ready ? 'Checking…' : critical ? 'Site has issues' : 'Great job!'}</h2>
          <p className="op-description">
            {rows.length === 0
              ? 'Running checks…'
              : critical
                ? 'A check failed. Details are in the table below.'
                : 'The session and site settings both responded.'}
          </p>
        </div>
      </div>
      <table className="op-list">
        <thead>
          <tr>
            <th>Check</th>
            <th>Status</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.ok ? 'Good' : 'Critical'}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Screen>
  );
}

export function PersonalDataScreen({ mode }: { mode: 'export' | 'erase' }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const users = await api<User[]>('/users');
      const user = users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
      if (!user) {
        setError('No user with that email.');
        return;
      }
      if (mode === 'export') {
        const posts = await api<Paginated<Content>>('/content?type=POST&perPage=50');
        const mine = posts.items.filter((post) => post.authorId === user.id);
        const blob = new Blob([JSON.stringify({ user, posts: mine }, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${user.email}-data.json`;
        link.click();
        URL.revokeObjectURL(url);
        setMessage('Export downloaded.');
      } else {
        await api(`/users/${user.id}`, { method: 'DELETE' });
        setMessage('The account was erased.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  }

  return (
    <Screen title={mode === 'export' ? 'Export Personal Data' : 'Erase Personal Data'}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {message ? <Notice kind="success">{message}</Notice> : null}
      <form onSubmit={submit}>
        <table className="op-form">
          <tbody>
            {field(
              'Email address',
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />,
              mode === 'erase'
                ? 'This deletes the account. Accounts that still own content or media cannot be deleted.'
                : 'Downloads that user’s posts.',
            )}
          </tbody>
        </table>
        <Button type="submit">{mode === 'export' ? 'Download personal data' : 'Erase personal data'}</Button>
      </form>
    </Screen>
  );
}

export function WritingSettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    api<Category[]>('/taxonomy/categories').then(setCategories).catch(() => {});
  }, []);
  return (
    <SettingsForm title="Writing Settings">
      {(settings, set) => (
        <>
          {field(
            'Default category',
            <Select
              value={String(settings.defaultCategoryId ?? '')}
              onChange={(e) => set({ defaultCategoryId: e.target.value || null })}
            >
              <option value="">— None —</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>,
          )}
        </>
      )}
    </SettingsForm>
  );
}

export function ReadingSettings() {
  const [pages, setPages] = useState<Content[]>([]);
  useEffect(() => {
    api<Paginated<Content>>('/content?type=PAGE&status=PUBLISHED&perPage=50')
      .then((data) => setPages(data.items))
      .catch(() => {});
  }, []);
  return (
    <SettingsForm title="Reading Settings">
      {(settings, set) => (
        <>
          {field(
            'Your homepage displays',
            <Select
              value={settings.homepageType}
              onChange={(e) =>
                set({ homepageType: e.target.value as SiteSettings['homepageType'] })
              }
            >
              <option value="latest-posts">Your latest posts</option>
              <option value="static-page">A static page</option>
            </Select>,
          )}
          {settings.homepageType === 'static-page'
            ? field(
                'Homepage',
                <Select
                  value={settings.homepageId ?? ''}
                  onChange={(e) => set({ homepageId: e.target.value || null })}
                >
                  <option value="">— Select —</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
                </Select>,
              )
            : null}
          {field(
            'Blog pages show at most',
            <Input
              type="number"
              min={1}
              max={50}
              value={settings.postsPerPage}
              onChange={(e) => set({ postsPerPage: Number(e.target.value) })}
            />,
          )}
        </>
      )}
    </SettingsForm>
  );
}

export function DiscussionSettings() {
  return (
    <SettingsForm title="Discussion Settings">
      {(settings, set) => (
        <>
          {field(
            'Default post settings',
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(settings.allowComments)}
                onChange={(e) => set({ allowComments: e.target.checked })}
              />
              Allow people to submit comments on new posts
            </label>,
          )}
          {field(
            'Before a comment appears',
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(settings.commentModeration)}
                onChange={(e) => set({ commentModeration: e.target.checked })}
              />
              Comment must be manually approved
            </label>,
          )}
          {field(
            'Comment author',
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(settings.commentRegistration)}
                onChange={(e) => set({ commentRegistration: e.target.checked })}
              />
              Users must be registered and logged in to comment
            </label>,
          )}
        </>
      )}
    </SettingsForm>
  );
}

export function MediaSettings() {
  return (
    <SettingsForm title="Media Settings">
      {(settings, set) => (
        <>
          {field(
            'Thumbnail size',
            <Input
              type="number"
              value={Number(settings.thumbnailSize ?? 150)}
              onChange={(e) => set({ thumbnailSize: Number(e.target.value) })}
            />,
            'Width in pixels.',
          )}
          {field(
            'Medium size',
            <Input
              type="number"
              value={Number(settings.mediumSize ?? 300)}
              onChange={(e) => set({ mediumSize: Number(e.target.value) })}
            />,
          )}
          {field(
            'Large size',
            <Input
              type="number"
              value={Number(settings.largeSize ?? 1024)}
              onChange={(e) => set({ largeSize: Number(e.target.value) })}
            />,
          )}
        </>
      )}
    </SettingsForm>
  );
}

export function PermalinkSettings() {
  return (
    <SettingsForm title="Permalink Settings">
      {(settings, set) =>
        field(
          'Permalink structure',
          <Select
            value={String(settings.permalinkStructure ?? '/%postname%/')}
            onChange={(e) => set({ permalinkStructure: e.target.value })}
          >
            <option value="/%postname%/">Post name — /sample-post</option>
          </Select>,
          'OpenPress publishes each post and page at its slug.',
        )
      }
    </SettingsForm>
  );
}

export function PrivacySettings() {
  const [pages, setPages] = useState<Content[]>([]);
  useEffect(() => {
    api<Paginated<Content>>('/content?type=PAGE&perPage=50')
      .then((data) => setPages(data.items))
      .catch(() => {});
  }, []);
  return (
    <SettingsForm title="Privacy Settings">
      {(settings, set) =>
        field(
          'Privacy policy page',
          <Select
            value={String(settings.privacyPageId ?? '')}
            onChange={(e) => set({ privacyPageId: e.target.value || null })}
          >
            <option value="">— Select —</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
          </Select>,
        )
      }
    </SettingsForm>
  );
}

type WidgetItem = { id: string; type: string; title: string; text?: string };
type WidgetAreas = { sidebar: WidgetItem[]; footer: WidgetItem[] };

const WIDGET_TYPES = [
  { type: 'search', title: 'Search' },
  { type: 'recent-posts', title: 'Recent Posts' },
  { type: 'recent-comments', title: 'Recent Comments' },
  { type: 'categories', title: 'Categories' },
  { type: 'text', title: 'Text' },
];

export function WidgetsScreen() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [areas, setAreas] = useState<WidgetAreas>({ sidebar: [], footer: [] });
  const [saved, setSaved] = useState(false);
  const [area, setArea] = useState<'sidebar' | 'footer'>('sidebar');

  useEffect(() => {
    api<SiteSettings>('/settings')
      .then((loaded) => {
        setSettings(loaded);
        const stored = loaded.widgets as WidgetAreas | undefined;
        setAreas({
          sidebar: Array.isArray(stored?.sidebar) ? stored.sidebar : [],
          footer: Array.isArray(stored?.footer) ? stored.footer : [],
        });
      })
      .catch(() => {});
  }, []);

  async function save(next: WidgetAreas = areas) {
    if (!settings) return;
    const updated = await api<SiteSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ ...settings, widgets: next }),
    });
    setSettings(updated);
    setAreas(next);
    setSaved(true);
  }

  return (
    <Screen
      title="Widgets"
      help="Add widgets to the sidebar or footer, then save. Titles and text widgets stay in site settings."
    >
      {saved ? <Notice kind="success">Widgets saved.</Notice> : null}
      <div className="op-split">
        <div className="op-postbox">
          <h2 className="px-3 py-2">Available widgets</h2>
          <ul className="divide-y divide-[#dcdcde]">
            {WIDGET_TYPES.map((widget) => (
              <li key={widget.type} className="flex items-center justify-between px-3 py-2">
                <span>{widget.title}</span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!settings}
                  onClick={() =>
                    save({
                      ...areas,
                      [area]: [
                        ...areas[area],
                        { id: `${widget.type}-${Date.now()}`, type: widget.type, title: widget.title, text: '' },
                      ],
                    })
                  }
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="op-tablenav">
            <Select value={area} onChange={(e) => setArea(e.target.value as 'sidebar' | 'footer')}>
              <option value="sidebar">Sidebar</option>
              <option value="footer">Footer</option>
            </Select>
          </div>
          {areas[area].length === 0 ? <p>This area has no widgets.</p> : null}
          <div className="space-y-3">
            {areas[area].map((widget, index) => (
              <div key={widget.id} className="op-postbox">
                <h2 className="flex items-center justify-between px-3 py-2">
                  {widget.title}
                  <button
                    type="button"
                    className="text-[13px] font-normal text-[#b32d2e]"
                    onClick={() =>
                      save({
                        ...areas,
                        [area]: areas[area].filter((_, i) => i !== index),
                      })
                    }
                  >
                    Delete
                  </button>
                </h2>
                <div className="space-y-2 p-3">
                  <Label>Title</Label>
                  <Input
                    value={widget.title}
                    onChange={(e) => {
                      const list = areas[area].map((item, i) =>
                        i === index ? { ...item, title: e.target.value } : item,
                      );
                      setAreas({ ...areas, [area]: list });
                      setSaved(false);
                    }}
                  />
                  {widget.type === 'text' ? (
                    <>
                      <Label>Content</Label>
                      <Textarea
                        rows={3}
                        value={widget.text ?? ''}
                        onChange={(e) => {
                          const list = areas[area].map((item, i) =>
                            i === index ? { ...item, text: e.target.value } : item,
                          );
                          setAreas({ ...areas, [area]: list });
                          setSaved(false);
                        }}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3">
            <Button type="button" disabled={!settings} onClick={() => save()}>
              Save Widgets
            </Button>
          </p>
        </div>
      </div>
    </Screen>
  );
}
