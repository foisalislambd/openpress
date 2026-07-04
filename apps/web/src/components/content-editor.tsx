'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Category, Content, Tag } from '@openpress/shared';
import { api } from '@/lib/client-api';
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
  Textarea,
  statusBadgeColor,
} from '@/components/ui';

const BlockEditor = dynamic(
  () => import('@/components/block-editor').then((m) => m.BlockEditor),
  { ssr: false, loading: () => <div className="min-h-[420px] rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-400">Loading editor...</div> },
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {contentId ? 'Edit' : 'New'} {type === 'POST' ? 'post' : 'page'}
          </h1>
          {existing ? (
            <Badge color={statusBadgeColor(existing.status)}>{existing.status}</Badge>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={saving} onClick={() => save('DRAFT')}>
            Save draft
          </Button>
          <Button disabled={saving} onClick={() => save('PUBLISHED')}>
            {existing?.status === 'PUBLISHED' ? 'Update' : 'Publish'}
          </Button>
        </div>
      </div>
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="!text-2xl font-bold"
          />
          <BlockEditor initialBlocks={blocks} onChange={setBlocks} />
        </div>
        <div className="space-y-4">
          <Card className="space-y-4 !p-4">
            <div>
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="auto-generated"
              />
            </div>
            <div>
              <Label>Excerpt</Label>
              <Textarea
                rows={3}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </div>
            <div>
              <Label>Cover image URL</Label>
              <Input
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="/uploads/..."
              />
            </div>
          </Card>
          {type === 'POST' ? (
            <Card className="space-y-4 !p-4">
              <div>
                <Label>Categories</Label>
                <div className="space-y-1">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
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
                  {categories.length === 0 ? (
                    <p className="text-xs text-zinc-400">No categories yet.</p>
                  ) : null}
                </div>
              </div>
              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setTagIds(
                          tagIds.includes(t.id)
                            ? tagIds.filter((id) => id !== t.id)
                            : [...tagIds, t.id],
                        )
                      }
                      className={
                        tagIds.includes(t.id)
                          ? 'rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs text-white'
                          : 'rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200'
                      }
                    >
                      {t.name}
                    </button>
                  ))}
                  {tags.length === 0 ? (
                    <p className="text-xs text-zinc-400">No tags yet.</p>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : null}
          <Card className="space-y-4 !p-4">
            <div>
              <Label>SEO title</Label>
              <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
            </div>
            <div>
              <Label>SEO description</Label>
              <Textarea
                rows={3}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
