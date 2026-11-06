'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Category, Content, ContentMeta, Tag } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Input, Label, Textarea } from '@/components/ui';
import { Notice } from '@/components/admin/screen';
import { RevisionsPanel } from '@/components/revisions-panel';
import { FieldGroups, MediaModal, PatternInserter, TranslationBox } from '@/components/editor-tools';
import type { Media } from '@openpress/shared';

const BlockEditor = dynamic(
  () => import('@/components/block-editor').then((m) => m.BlockEditor),
  { ssr: false, loading: () => <div className="min-h-[420px] border border-[#c3c4c7] bg-white p-6 text-[13px] text-[#646970]">Loading editor…</div> },
);

export function ContentEditor({
  type,
  contentId,
}: {
  type: 'POST' | 'PAGE';
  contentId?: string;
}) {
  const router = useRouter();
  const base = type === 'POST' ? '/admin/posts' : '/admin/pages';
  const [loaded, setLoaded] = useState(!contentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<Content | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [blocks, setBlocks] = useState<unknown[]>([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoCanonical, setSeoCanonical] = useState('');
  const [seoRobots, setSeoRobots] = useState('index, follow');
  const [seoImage, setSeoImage] = useState('');
  const [locale, setLocale] = useState('en');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [mediaOpen, setMediaOpen] = useState(false);
  const [coverImage, setCoverImage] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE' | 'PASSWORD'>('PUBLIC');
  const [password, setPassword] = useState('');
  const [sticky, setSticky] = useState(false);
  const [commentStatus, setCommentStatus] = useState<'open' | 'closed'>('open');
  const [scheduledAt, setScheduledAt] = useState('');
  const [meta, setMeta] = useState<ContentMeta[]>([]);
  const [metaKey, setMetaKey] = useState('');
  const [metaValue, setMetaValue] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [revisionRefresh, setRevisionRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [autosave, setAutosave] = useState<{ title: string; blocks: unknown[]; excerpt?: string | null; updatedAt: string } | null>(null);

  useEffect(() => {
    api<Category[]>('/taxonomy/categories').then(setCategories).catch(() => {});
    api<Tag[]>('/taxonomy/tags').then(setTags).catch(() => {});
    if (contentId) {
      api<Content>(`/content/${contentId}`)
        .then((c) => {
          setExisting(c);
          setTitle(c.title);
          setSlug(c.slug);
          setExcerpt(c.excerpt ?? '');
          setBlocks(c.blocks ?? []);
          const seo = c.seo as { title?: string; description?: string; canonical?: string; robots?: string; ogImage?: string };
          setSeoTitle(seo?.title ?? '');
          setSeoDescription(seo?.description ?? '');
          setSeoCanonical(seo?.canonical ?? '');
          setSeoRobots(seo?.robots || 'index, follow');
          setSeoImage(seo?.ogImage ?? '');
          setLocale(c.locale || 'en');
          const nextFields: Record<string, string> = {};
          for (const field of c.meta ?? []) {
            if (typeof field.value === 'string' || typeof field.value === 'number' || typeof field.value === 'boolean') {
              nextFields[field.key] = String(field.value);
            }
          }
          setFieldValues(nextFields);
          setCoverImage(c.coverImage ?? '');
          setCategoryIds(c.categories?.map((x) => x.id) ?? []);
          setTagIds(c.tags?.map((x) => x.id) ?? []);
          setVisibility(c.visibility ?? 'PUBLIC');
          setSticky(Boolean(c.sticky));
          setCommentStatus(c.commentStatus ?? 'open');
          setScheduledAt(c.scheduledAt ? c.scheduledAt.slice(0, 16) : '');
          setMeta(c.meta ?? []);
          setLoaded(true);
          api<{ title: string; blocks: unknown[]; excerpt?: string | null; updatedAt: string } | null>(
            `/content/${contentId}/autosave`,
          )
            .then((saved) => {
              if (saved && new Date(saved.updatedAt).getTime() > new Date(c.updatedAt).getTime()) {
                setAutosave(saved);
              }
            })
            .catch(() => {});
        })
        .catch(() => setError('Failed to load content'));
    }
  }, [contentId]);

  useEffect(() => {
    if (!contentId || !loaded) return;
    const handle = window.setInterval(() => {
      api(`/content/${contentId}/autosave`, {
        method: 'PUT',
        body: JSON.stringify({ title: title || 'Untitled', blocks, excerpt }),
      })
        .then(() => setNotice(`Autosaved at ${new Date().toLocaleTimeString()}`))
        .catch(() => {});
    }, 30_000);
    return () => window.clearInterval(handle);
  }, [contentId, loaded, title, blocks, excerpt]);

  function applyContent(content: Content) {
    setExisting(content);
    setTitle(content.title);
    setSlug(content.slug);
    setBlocks(content.blocks ?? []);
    setEditorKey((key) => key + 1);
    setRevisionRefresh((key) => key + 1);
  }

  async function save(status?: string) {
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      title: title || 'Untitled',
      slug: slug || undefined,
      type,
      status: status ?? existing?.status ?? 'DRAFT',
      excerpt: excerpt || undefined,
      blocks,
      seo: {
        title: seoTitle || undefined,
        description: seoDescription || undefined,
        canonical: seoCanonical || undefined,
        robots: seoRobots || undefined,
        ogImage: seoImage || undefined,
      },
      locale,
      fields: fieldValues,
      postType: type === 'PAGE' ? 'page' : 'post',
      coverImage: coverImage || undefined,
      categoryIds,
      tagIds,
      visibility,
      sticky,
      commentStatus,
      ...(password ? { password } : {}),
      ...(status === 'SCHEDULED' && scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    };
    try {
      if (contentId) {
        const updated = await api<Content>(`/content/${contentId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setExisting(updated);
        setSlug(updated.slug);
        setPassword('');
        setMeta(updated.meta ?? []);
        setRevisionRefresh((key) => key + 1);
        setNotice(status === 'PUBLISHED' ? 'Updated.' : 'Saved.');
      } else {
        const created = await api<Content>('/content', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        router.replace(`${base}/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded && !error) {
    return <div className="text-zinc-400">Loading...</div>;
  }

  const noun = type === 'POST' ? 'Post' : 'Page';
  return (
    <div>
      <div className="op-editor-bar">
        <strong>
          {contentId ? 'Edit' : 'Add'} {noun}
        </strong>
        <span className="text-[#646970]">
          {existing?.status ?? 'DRAFT'}
          {visibility === 'PRIVATE' ? ' · Private' : ''}
          {visibility === 'PASSWORD' ? ' · Password' : ''}
        </span>
        <span className="ml-auto flex gap-2">
          {existing?.status === 'PUBLISHED' ? (
            <a href={`/${existing.slug}`} target="_blank" rel="noreferrer">
              View
            </a>
          ) : null}
          <Button variant="secondary" disabled={saving} onClick={() => save('DRAFT')}>
            Save Draft
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => save('PENDING')}>
            Submit for review
          </Button>
          <Button disabled={saving} onClick={() => save('PUBLISHED')}>
            {existing?.status === 'PUBLISHED' ? 'Update' : 'Publish'}
          </Button>
        </span>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {notice ? <Notice kind="success">{notice}</Notice> : null}
      {autosave ? (
        <Notice kind="success">
          An autosave from {new Date(autosave.updatedAt).toLocaleString()} is newer than the saved copy.{' '}
          <button
            type="button"
            onClick={() => {
              setTitle(autosave.title);
              setExcerpt(autosave.excerpt ?? '');
              setBlocks(autosave.blocks ?? []);
              setEditorKey((key) => key + 1);
              setAutosave(null);
            }}
          >
            Restore autosave
          </button>
        </Notice>
      ) : null}
      {contentId ? <div id="op-revision-compare" /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <Input
            placeholder="Add title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="!px-3 !py-2 !text-[1.7em] !font-normal"
          />
          <BlockEditor key={editorKey} initialBlocks={blocks} onChange={setBlocks} />
          <div className="flex flex-wrap items-end gap-3">
            <PatternInserter
              onInsert={(extra) => {
                setBlocks((current) => [...current, ...extra]);
                setEditorKey((key) => key + 1);
              }}
            />
            <Button type="button" variant="secondary" onClick={() => setMediaOpen(true)}>
              Add media
            </Button>
          </div>
          <MediaModal
            open={mediaOpen}
            onClose={() => setMediaOpen(false)}
            onPick={(item: Media) => {
              setBlocks((current) => [
                ...current,
                {
                  id: `media-${item.id}`,
                  type: 'image',
                  props: {
                    url: item.url,
                    caption: item.caption || item.alt || '',
                    alt: item.alt || '',
                    srcset: item.srcset || '',
                    webpSrcset: item.webpSrcset || '',
                    focalX: item.focalX ?? 0.5,
                    focalY: item.focalY ?? 0.5,
                  },
                  content: [],
                  children: [],
                },
              ]);
              setEditorKey((key) => key + 1);
              setMediaOpen(false);
            }}
          />
        </div>
        <div className="space-y-3">
          <div className="op-postbox">
            <h2 className="px-3 py-2">Publish</h2>
            <div className="space-y-2 p-3 text-[13px]">
              <p>
                Status: <strong>{existing?.status ?? 'DRAFT'}</strong>
              </p>
              <Label>Visibility</Label>
              <select
                className="w-full border border-[#8c8f94] px-2 py-1"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as typeof visibility)}
              >
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
                <option value="PASSWORD">Password protected</option>
              </select>
              {visibility === 'PASSWORD' ? (
                <Input
                  type="password"
                  value={password}
                  placeholder={existing?.passwordProtected ? 'Password is set' : 'Password'}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              ) : null}
              <Label>Schedule</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              {type === 'POST' ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} />
                  Stick to the top of the blog
                </label>
              ) : null}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={commentStatus === 'open'}
                  onChange={(e) => setCommentStatus(e.target.checked ? 'open' : 'closed')}
                />
                Allow comments
              </label>
              <div className="flex flex-wrap gap-2 border-t border-[#dcdcde] pt-3">
                <Button variant="secondary" disabled={saving} onClick={() => save('DRAFT')}>
                  Save Draft
                </Button>
                <Button variant="secondary" disabled={saving} onClick={() => save('PENDING')}>
                  Pending review
                </Button>
                <Button disabled={saving} onClick={() => save('PUBLISHED')}>
                  {existing?.status === 'PUBLISHED' ? 'Update' : 'Publish'}
                </Button>
                <Button variant="secondary" disabled={saving || !scheduledAt} onClick={() => save('SCHEDULED')}>
                  Schedule
                </Button>
              </div>
            </div>
          </div>
          <div className="border border-[#c3c4c7] bg-white">
            <h2 className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-3 py-2">Permalink</h2>
            <div className="space-y-3 p-3">
              <div>
                <Label>Slug</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-generated" />
              </div>
              <div>
                <Label>Excerpt</Label>
                <Textarea rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
              </div>
              <div>
                <Label>Cover image URL</Label>
                <Input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="/uploads/..." />
              </div>
            </div>
          </div>
          {contentId ? (
            <RevisionsPanel
              contentId={contentId}
              title={title}
              blocks={blocks}
              refreshKey={revisionRefresh}
              onRestored={(content) => {
                applyContent(content);
                setNotice('Revision restored. Excerpt, SEO, and taxonomy were left unchanged.');
              }}
            />
          ) : null}
          {type === 'POST' ? (
            <div className="border border-[#c3c4c7] bg-white">
              <h2 className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-3 py-2">Categories and tags</h2>
              <div className="space-y-3 p-3">
                <div className="max-h-40 space-y-1 overflow-auto">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={categoryIds.includes(c.id)}
                        onChange={(e) =>
                          setCategoryIds(
                            e.target.checked
                              ? [...categoryIds, c.id]
                              : categoryIds.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {c.name}
                    </label>
                  ))}
                  {categories.length === 0 ? <p className="op-description">No categories yet.</p> : null}
                </div>
                <div className="max-h-40 space-y-1 overflow-auto">
                  {tags.map((t) => (
                    <label key={t.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tagIds.includes(t.id)}
                        onChange={(e) =>
                          setTagIds(
                            e.target.checked ? [...tagIds, t.id] : tagIds.filter((id) => id !== t.id),
                          )
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                  {tags.length === 0 ? <p className="op-description">No tags yet.</p> : null}
                </div>
              </div>
            </div>
          ) : null}
          <div className="border border-[#c3c4c7] bg-white">
            <h2 className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-3 py-2">Custom fields</h2>
            <div className="space-y-2 p-3 text-[13px]">
              {meta.map((field) => (
                <div key={field.key} className="flex items-start justify-between gap-2">
                  <div>
                    <strong>{field.key}</strong>
                    <p className="break-all text-[#646970]">{JSON.stringify(field.value)}</p>
                  </div>
                  {contentId ? (
                    <button
                      type="button"
                      className="text-[#b32d2e]"
                      onClick={async () => {
                        const next = await api<ContentMeta[]>(`/content/${contentId}/meta/${encodeURIComponent(field.key)}`, {
                          method: 'DELETE',
                        });
                        setMeta(next);
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ))}
              {meta.length === 0 ? <p className="op-description">No custom fields yet.</p> : null}
              {contentId ? (
                <div className="space-y-2 border-t border-[#dcdcde] pt-2">
                  <Input placeholder="Key" value={metaKey} onChange={(e) => setMetaKey(e.target.value)} />
                  <Input placeholder="Value" value={metaValue} onChange={(e) => setMetaValue(e.target.value)} />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      if (!metaKey.trim()) return;
                      const next = await api<ContentMeta[]>(`/content/${contentId}/meta`, {
                        method: 'PUT',
                        body: JSON.stringify({ key: metaKey.trim(), value: metaValue }),
                      });
                      setMeta(next);
                      setMetaKey('');
                      setMetaValue('');
                    }}
                  >
                    Add custom field
                  </Button>
                </div>
              ) : (
                <p className="op-description">Save the {noun.toLowerCase()} before adding custom fields.</p>
              )}
            </div>
          </div>
          <div className="border border-[#c3c4c7] bg-white">
            <h2 className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-3 py-2">SEO</h2>
            <div className="space-y-3 p-3">
              <div>
                <Label>SEO title</Label>
                <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
              </div>
              <div>
                <Label>SEO description</Label>
                <Textarea rows={3} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
              </div>
              <div>
                <Label>Canonical URL</Label>
                <Input value={seoCanonical} onChange={(e) => setSeoCanonical(e.target.value)} placeholder="Leave empty to use the permalink" />
              </div>
              <div>
                <Label>Robots</Label>
                <select className="w-full border border-[#8c8f94] px-2 py-1" value={seoRobots} onChange={(e) => setSeoRobots(e.target.value)}>
                  <option value="index, follow">Index, follow</option>
                  <option value="noindex, follow">No index, follow</option>
                  <option value="index, nofollow">Index, no follow</option>
                  <option value="noindex, nofollow">No index, no follow</option>
                </select>
              </div>
              <div>
                <Label>Open Graph image URL</Label>
                <Input value={seoImage} onChange={(e) => setSeoImage(e.target.value)} />
              </div>
              <div>
                <Label>Language</Label>
                <Input value={locale} onChange={(e) => setLocale(e.target.value)} />
              </div>
            </div>
          </div>
          <FieldGroups
            postType={type === 'PAGE' ? 'page' : 'post'}
            values={fieldValues}
            onChange={(key, value) => setFieldValues((current) => ({ ...current, [key]: value }))}
          />
          <TranslationBox contentId={contentId} base={base} />
        </div>
      </div>
    </div>
  );
}
