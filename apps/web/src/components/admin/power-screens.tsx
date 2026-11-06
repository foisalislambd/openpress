'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import type { Media, SiteSettings } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Input, Label, Textarea } from '@/components/ui';
import { Notice, Screen, useSiteSettings } from '@/components/admin/screen';

type PostType = { slug: string; label: string; singular: string; builtin: boolean; public: boolean };
type Taxonomy = { slug: string; label: string; singular: string; hierarchical: boolean; builtin: boolean };
type Term = { id: string; name: string; slug: string };
type FieldGroup = { id: string; title: string; postTypes: string[]; fields: { id: string; key: string; label: string; type: string }[] };
type Pattern = { id: string; title: string; synced: boolean };
type Webhook = { id: string; name: string; url: string; events: string[]; active: boolean };
type Session = { id: string; userAgent?: string | null; ip?: string | null; createdAt: string; revokedAt?: string | null };
type ApiKey = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string };

export function PostTypesScreen() {
  const [rows, setRows] = useState<PostType[]>([]);
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  function load() {
    return api<PostType[]>('/modeling/post-types').then(setRows);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);
  return (
    <Screen title="Post Types" help="Register a public type such as book or event. Posts and pages stay built in.">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          try {
            await api('/modeling/post-types', { method: 'POST', body: JSON.stringify({ slug, label, singular: label }) });
            setSlug('');
            setLabel('');
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not register that type');
          }
        }}
      >
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="book" aria-label="Slug" />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Books" aria-label="Label" />
        <Button type="submit">Add post type</Button>
      </form>
      <table className="op-list">
        <thead>
          <tr><th>Label</th><th>Slug</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slug}>
              <td>{row.label}</td>
              <td>{row.slug}</td>
              <td>
                {row.builtin ? 'Built-in' : (
                  <button type="button" onClick={() => api(`/modeling/post-types/${row.slug}`, { method: 'DELETE' }).then(load)}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Screen>
  );
}

export function TaxonomiesScreen() {
  const [rows, setRows] = useState<Taxonomy[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [active, setActive] = useState('');
  const [termName, setTermName] = useState('');
  const [error, setError] = useState('');
  function load() {
    return api<Taxonomy[]>('/modeling/taxonomies').then(setRows);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);
  useEffect(() => {
    if (!active || active === 'category' || active === 'post_tag') return;
    api<Term[]>(`/modeling/taxonomies/${active}/terms`).then(setTerms).catch(() => setTerms([]));
  }, [active]);
  return (
    <Screen title="Taxonomies" help="Categories and tags stay on their own screens. Custom taxonomies get terms here.">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          try {
            await api('/modeling/taxonomies', { method: 'POST', body: JSON.stringify({ slug, label, hierarchical: false }) });
            setSlug('');
            setLabel('');
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not register that taxonomy');
          }
        }}
      >
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="genre" aria-label="Slug" />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Genres" aria-label="Label" />
        <Button type="submit">Add taxonomy</Button>
      </form>
      <ul className="mb-4 space-y-1">
        {rows.map((row) => (
          <li key={row.slug}>
            <button type="button" onClick={() => { setActive(row.slug); setTerms([]); }}>{row.label} ({row.slug})</button>
            {row.builtin ? null : (
              <button type="button" className="ml-2 text-[#b32d2e]" onClick={() => api(`/modeling/taxonomies/${row.slug}`, { method: 'DELETE' }).then(load)}>Delete</button>
            )}
          </li>
        ))}
      </ul>
      {active && active !== 'category' && active !== 'post_tag' ? (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await api(`/modeling/taxonomies/${active}/terms`, { method: 'POST', body: JSON.stringify({ name: termName }) });
            setTermName('');
            setTerms(await api<Term[]>(`/modeling/taxonomies/${active}/terms`));
          }}
        >
          <Input value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="Term name" />
          <Button type="submit">Add term</Button>
          <ul>{terms.map((term) => <li key={term.id}>{term.name}</li>)}</ul>
        </form>
      ) : null}
    </Screen>
  );
}

export function FieldGroupsScreen() {
  const [rows, setRows] = useState<FieldGroup[]>([]);
  const [title, setTitle] = useState('');
  const [keyName, setKeyName] = useState('');
  const [label, setLabel] = useState('');
  const [groupId, setGroupId] = useState('');
  function load() {
    return api<FieldGroup[]>('/modeling/field-groups').then((next) => {
      setRows(next);
      setGroupId((current) => current || next[0]?.id || '');
    });
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);
  return (
    <Screen title="Field Groups" help="Fields are stored as content meta and shown on the post editor for the post type.">
      <form className="mb-4 flex gap-2" onSubmit={async (event) => { event.preventDefault(); await api('/modeling/field-groups', { method: 'POST', body: JSON.stringify({ title, postTypes: ['post'] }) }); setTitle(''); await load(); }}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group title" />
        <Button type="submit">Add group</Button>
      </form>
      {rows.map((group) => (
        <div key={group.id} className="mb-4 border border-[#c3c4c7] bg-white p-3">
          <strong>{group.title}</strong>
          <ul>{group.fields.map((field) => <li key={field.id}>{field.label} ({field.key}, {field.type})</li>)}</ul>
          {groupId === group.id || true ? (
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={async (event) => {
              event.preventDefault();
              await api(`/modeling/field-groups/${group.id}/fields`, { method: 'POST', body: JSON.stringify({ key: keyName, label, type: 'text' }) });
              setKeyName('');
              setLabel('');
              await load();
            }}>
              <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="field_key" />
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
              <Button type="submit">Add text field</Button>
            </form>
          ) : null}
        </div>
      ))}
    </Screen>
  );
}

export function PatternsScreen() {
  const [rows, setRows] = useState<Pattern[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [synced, setSynced] = useState(false);
  function load() {
    return api<Pattern[]>('/modeling/patterns').then(setRows);
  }
  useEffect(() => { load().catch(() => {}); }, []);
  return (
    <Screen title="Patterns" help="Reusable block patterns. Synced patterns stay linked and expand on the public site.">
      <form className="mb-4 space-y-2" onSubmit={async (event) => {
        event.preventDefault();
        await api('/modeling/patterns', {
          method: 'POST',
          body: JSON.stringify({
            title,
            synced,
            content: [{ id: 'p', type: 'paragraph', props: {}, content: [{ type: 'text', text: body, styles: {} }], children: [] }],
          }),
        });
        setTitle('');
        setBody('');
        await load();
      }}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pattern name" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Paragraph text" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={synced} onChange={(e) => setSynced(e.target.checked)} /> Synced pattern</label>
        <Button type="submit">Save pattern</Button>
      </form>
      <ul>{rows.map((row) => <li key={row.id}>{row.title}{row.synced ? ' · synced' : ''}</li>)}</ul>
    </Screen>
  );
}

export function SeoSettingsScreen() {
  const { settings, setSettings, save, saved, error } = useSettingsForm();
  if (!settings) return <Screen title="SEO"><p>Loading…</p></Screen>;
  return (
    <Screen title="SEO">
      <form onSubmit={save} className="max-w-xl space-y-3">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {saved ? <Notice kind="success">Saved.</Notice> : null}
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.blogPublic !== false} onChange={(e) => setSettings({ ...settings, blogPublic: e.target.checked })} /> Allow search engines to index this site</label>
        <Label>Default Open Graph image</Label>
        <Input value={String(settings.defaultOgImage ?? '')} onChange={(e) => setSettings({ ...settings, defaultOgImage: e.target.value })} />
        <Label>Twitter site</Label>
        <Input value={String(settings.twitterSite ?? '')} onChange={(e) => setSettings({ ...settings, twitterSite: e.target.value })} placeholder="@site" />
        <Button type="submit">Save changes</Button>
      </form>
    </Screen>
  );
}

export function LanguagesScreen() {
  const { settings, setSettings, save, saved } = useSettingsForm();
  const [rows, setRows] = useState<{ locale: string; key: string; value: string }[]>([]);
  const [locale, setLocale] = useState('en');
  const [keyName, setKeyName] = useState('nav.search');
  const [value, setValue] = useState('');
  useEffect(() => { api<typeof rows>('/i18n').then(setRows).catch(() => {}); }, []);
  return (
    <Screen title="Languages" help="Per-post translations are edited on the post. This catalog is the admin string foundation. RTL locales set dir=rtl on the public site.">
      {settings ? (
        <form onSubmit={save} className="mb-4 flex items-end gap-2">
          <label>Site language<Input value={String(settings.siteLanguage ?? 'en')} onChange={(e) => setSettings({ ...settings, siteLanguage: e.target.value })} /></label>
          <Button type="submit">Save</Button>
          {saved ? <span>Saved.</span> : null}
        </form>
      ) : null}
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={async (event) => {
        event.preventDefault();
        await api('/i18n', { method: 'PUT', body: JSON.stringify({ locale, key: keyName, value }) });
        setRows(await api('/i18n'));
      }}>
        <Input value={locale} onChange={(e) => setLocale(e.target.value)} aria-label="Locale" />
        <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} aria-label="Key" />
        <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Value" />
        <Button type="submit">Save string</Button>
      </form>
      <ul>{rows.map((row) => <li key={`${row.locale}:${row.key}`}>{row.locale} · {row.key}: {row.value}</li>)}</ul>
      <h2 className="mb-2 mt-6">Gettext</h2>
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await api('/i18n/messages', {
          method: 'PUT',
          body: JSON.stringify({
            locale: String(data.get('glocale') ?? 'en'),
            domain: String(data.get('domain') ?? 'openpress'),
            context: String(data.get('context') ?? ''),
            msgid: String(data.get('msgid') ?? ''),
            msgidPlural: String(data.get('plural') ?? ''),
            msgstr: String(data.get('msgstr') ?? ''),
            msgstrPlural: String(data.get('msgstrPlural') ?? ''),
          }),
        });
      }}>
        <Input name="glocale" defaultValue="en" aria-label="Gettext locale" />
        <Input name="domain" defaultValue="openpress" aria-label="Domain" />
        <Input name="context" placeholder="context" aria-label="Context" />
        <Input name="msgid" placeholder="msgid" aria-label="Message" required />
        <Input name="plural" placeholder="msgid plural" aria-label="Plural" />
        <Input name="msgstr" placeholder="translation" aria-label="Translation" />
        <Input name="msgstrPlural" placeholder="plural translation" aria-label="Plural translation" />
        <Button type="submit">Save message</Button>
      </form>
    </Screen>
  );
}

export function WebhooksScreen() {
  const [rows, setRows] = useState<Webhook[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  function load() { return api<Webhook[]>('/webhooks').then(setRows); }
  useEffect(() => { load().catch(() => {}); }, []);
  return (
    <Screen title="Webhooks" help="Deliveries include an X-OpenPress-Signature header, sha256 of the JSON body.">
      {secret ? <Notice kind="success">Signing secret (shown once): {secret}</Notice> : null}
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={async (event) => {
        event.preventDefault();
        const created = await api<Webhook & { secret: string }>('/webhooks', { method: 'POST', body: JSON.stringify({ name, url, events: ['content.published', 'comment.created'] }) });
        setSecret(created.secret);
        setName('');
        setUrl('');
        await load();
      }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hook" />
        <Button type="submit">Add webhook</Button>
      </form>
      <ul>{rows.map((row) => (
        <li key={row.id}>{row.name} → {row.url} <button type="button" onClick={() => api(`/webhooks/${row.id}`, { method: 'DELETE' }).then(load)}>Delete</button></li>
      ))}</ul>
    </Screen>
  );
}

export function AssistantScreen() {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  return (
    <Screen title="Assistant" help="Plugins can replace this with the assistant.complete filter. The default provider is a stub unless AI_PROVIDER=openai.">
      <form className="max-w-xl space-y-2" onSubmit={async (event) => {
        event.preventDefault();
        const result = await api<{ text?: string; provider?: string }>('/assistant/complete', { method: 'POST', body: JSON.stringify({ prompt }) });
        setAnswer(`${result.provider ?? 'stub'}: ${result.text ?? ''}`);
      }}>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="Summarize the latest post" />
        <Button type="submit">Ask</Button>
      </form>
      {answer ? <p className="mt-3 whitespace-pre-wrap">{answer}</p> : null}
    </Screen>
  );
}

export function SecurityScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [keyName, setKeyName] = useState('Editorial');
  function load() {
    return Promise.all([
      api<Session[]>('/auth/sessions'),
      api<ApiKey[]>('/auth/api-keys'),
    ]).then(([nextSessions, nextKeys]) => {
      setSessions(nextSessions);
      setKeys(nextKeys);
    });
  }
  useEffect(() => { load().catch(() => {}); }, []);
  return (
    <Screen title="Security" help="Authenticator app, passkeys, sessions, and scoped API keys. Application passwords stay on the profile form.">
      {message ? <Notice kind="success">{message}</Notice> : null}
      <h2 className="mb-2 text-base">Two-factor authentication</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={async () => {
          const setup = await api<{ secret: string; otpauth: string }>('/auth/totp/setup', { method: 'POST', body: '{}' });
          setSecret(`${setup.secret} ${setup.otpauth}`);
        }}>Set up authenticator</Button>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" aria-label="Authenticator code" />
        <Button type="button" onClick={async () => { await api('/auth/totp/confirm', { method: 'POST', body: JSON.stringify({ code }) }); setMessage('Authenticator enabled.'); }}>Confirm</Button>
        <Button type="button" variant="secondary" onClick={async () => { await api('/auth/totp', { method: 'DELETE' }); setMessage('Authenticator removed.'); }}>Disable</Button>
      </div>
      {secret ? <p className="mb-4 break-all text-sm">{secret}</p> : null}
      <h2 className="mb-2 text-base">Passkeys</h2>
      <Button type="button" className="mb-4" variant="secondary" onClick={async () => {
        const options = await api<Record<string, unknown>>('/auth/passkeys/register/options', { method: 'POST', body: '{}' });
        const response = await startRegistration({ optionsJSON: options as never });
        await api('/auth/passkeys/register/verify', { method: 'POST', body: JSON.stringify({ response }) });
        setMessage('Passkey saved on this device.');
      }}>Register a passkey</Button>
      <h2 className="mb-2 text-base">Sessions</h2>
      <ul className="mb-4">
        {sessions.map((session) => (
          <li key={session.id}>
            {new Date(session.createdAt).toLocaleString()} · {session.ip || 'unknown IP'} · {session.revokedAt ? 'revoked' : 'active'}
            {session.revokedAt ? null : <button type="button" className="ml-2" onClick={() => api(`/auth/sessions/${session.id}`, { method: 'DELETE' }).then(load)}>Revoke</button>}
          </li>
        ))}
      </ul>
      <h2 className="mb-2 text-base">API keys</h2>
      {token ? <Notice kind="warning">Copy this key now. It is not shown again. {token}</Notice> : null}
      <form className="mb-3 flex gap-2" onSubmit={async (event) => {
        event.preventDefault();
        const created = await api<{ token: string }>('/auth/api-keys', { method: 'POST', body: JSON.stringify({ name: keyName, scopes: ['content:read', 'content:write', 'media:read', 'mcp'] }) });
        setToken(created.token);
        await load();
      }}>
        <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} />
        <Button type="submit">Create key</Button>
      </form>
      <ul>{keys.map((key) => <li key={key.id}>{key.name} · {key.prefix}… · {key.scopes.join(', ')} <button type="button" onClick={() => api(`/auth/api-keys/${key.id}`, { method: 'DELETE' }).then(load)}>Revoke</button></li>)}</ul>
    </Screen>
  );
}

export function MediaEditScreen({ id }: { id: string }) {
  const router = useRouter();
  const [media, setMedia] = useState<Media | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<Media>(`/media/${id}`).then(setMedia).catch(() => setError('Media not found')); }, [id]);
  if (!media) return <Screen title="Edit media">{error ? <Notice kind="error">{error}</Notice> : <p>Loading…</p>}</Screen>;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!media) return;
    const updated = await api<Media>(`/media/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ alt: media.alt, caption: media.caption, focalX: media.focalX, focalY: media.focalY }),
    });
    setMedia(updated);
    setMessage('Saved.');
  }
  return (
    <Screen title="Edit media">
      {message ? <Notice kind="success">{message}</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {media.mimeType.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt={media.alt ?? ''} style={{ objectPosition: `${(media.focalX ?? 0.5) * 100}% ${(media.focalY ?? 0.5) * 100}%` }} className="w-full object-cover" />
        ) : null}
        <form onSubmit={save} className="space-y-2">
          <Label>Alt text</Label>
          <Input value={media.alt ?? ''} onChange={(e) => setMedia({ ...media, alt: e.target.value })} />
          <Label>Caption</Label>
          <Input value={media.caption ?? ''} onChange={(e) => setMedia({ ...media, caption: e.target.value })} />
          <Label>Focal point X ({media.focalX ?? 0.5})</Label>
          <input type="range" min="0" max="1" step="0.01" value={media.focalX ?? 0.5} onChange={(e) => setMedia({ ...media, focalX: Number(e.target.value) })} />
          <Label>Focal point Y ({media.focalY ?? 0.5})</Label>
          <input type="range" min="0" max="1" step="0.01" value={media.focalY ?? 0.5} onChange={(e) => setMedia({ ...media, focalY: Number(e.target.value) })} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Update</Button>
            <Button type="button" variant="secondary" onClick={async () => setMedia(await api<Media>(`/media/${id}/transform`, { method: 'POST', body: JSON.stringify({ rotate: 90 }) }))}>Rotate 90°</Button>
            <Button type="button" variant="secondary" onClick={async () => setMedia(await api<Media>(`/media/${id}/transform`, { method: 'POST', body: JSON.stringify({ flip: 'horizontal' }) }))}>Flip horizontal</Button>
            <Button type="button" variant="secondary" onClick={async () => setMedia(await api<Media>(`/media/${id}/transform`, { method: 'POST', body: JSON.stringify({ width: 1200 }) }))}>Resize to 1200px</Button>
            <Button type="button" variant="secondary" onClick={async () => setMedia(await api<Media>(`/media/${id}/regenerate`, { method: 'POST', body: '{}' }))}>Regenerate sizes</Button>
            <Button type="button" variant="secondary" onClick={() => router.push('/admin/media')}>Back</Button>
          </div>
          {media.srcset ? <p className="break-all text-xs text-[#646970]">srcset: {media.srcset}</p> : null}
        </form>
      </div>
    </Screen>
  );
}

function useSettingsForm() {
  const state = useSiteSettings();
  return state;
}

export type { SiteSettings };
