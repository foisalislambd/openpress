'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Category, Content, Tag } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Input, Label, Textarea } from '@/components/ui';
import { Notice } from '@/components/admin/screen';

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
  const [coverImage, setCoverImage] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);

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
          const seo = c.seo as { title?: string; description?: string };
          setSeoTitle(seo?.title ?? '');
          setSeoDescription(seo?.description ?? '');
          setCoverImage(c.coverImage ?? '');
          setCategoryIds(c.categories?.map((x) => x.id) ?? []);
          setTagIds(c.tags?.map((x) => x.id) ?? []);
          setLoaded(true);
        })
        .catch(() => setError('Failed to load content'));
    }
  }, [contentId]);

  async function save(status?: string) {
    setSaving(true);
    setError('');
    const payload = {
      title: title || 'Untitled',
      slug: slug || undefined,
      type,
      status: status ?? existing?.status ?? 'DRAFT',
      excerpt: excerpt || undefined,
      blocks,
      seo: { title: seoTitle || undefined, description: seoDescription || undefined },
      coverImage: coverImage || undefined,
      categoryIds,
      tagIds,
    };
    try {
      if (contentId) {
        const updated = await api<Content>(`/content/${contentId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setExisting(updated);
        setSlug(updated.slug);
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
        <span className="text-[#646970]">{existing?.status ?? 'DRAFT'}</span>
        <span className="ml-auto flex gap-2">
          {existing?.status === 'PUBLISHED' ? (
            <a href={`/${existing.slug}`} target="_blank" rel="noreferrer">
              View
            </a>
          ) : null}
          <Button variant="secondary" disabled={saving} onClick={() => save('DRAFT')}>
            Save Draft
          </Button>
          <Button disabled={saving} onClick={() => save('PUBLISHED')}>
            {existing?.status === 'PUBLISHED' ? 'Update' : 'Publish'}
          </Button>
        </span>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <Input
            placeholder="Add title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="!px-3 !py-2 !text-[1.7em] !font-normal"
          />
          <BlockEditor initialBlocks={blocks} onChange={setBlocks} />
        </div>
        <div className="space-y-3">
          <div className="op-postbox">
            <h2 className="px-3 py-2">Publish</h2>
            <div className="space-y-2 p-3 text-[13px]">
              <p>
                Status: <strong>{existing?.status ?? 'DRAFT'}</strong>
              </p>
              <p>
                Visibility: <strong>{existing?.status === 'PUBLISHED' ? 'Public' : 'Not published'}</strong>
              </p>
              <div className="flex gap-2 border-t border-[#dcdcde] pt-3">
                <Button variant="secondary" disabled={saving} onClick={() => save('DRAFT')}>
                  Save Draft
                </Button>
                <Button disabled={saving} onClick={() => save('PUBLISHED')}>
                  {existing?.status === 'PUBLISHED' ? 'Update' : 'Publish'}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
