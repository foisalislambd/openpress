'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { Comment, Content, Paginated, SiteSettings, User } from '@openpress/shared';
import { api } from '@/lib/client-api';

type WidgetKey = 'glance' | 'activity' | 'draft';

const WIDGETS: { key: WidgetKey; label: string }[] = [
  { key: 'glance', label: 'At a Glance' },
  { key: 'activity', label: 'Activity' },
  { key: 'draft', label: 'Quick Draft' },
];

export default function DashboardPage() {
  const [posts, setPosts] = useState<Paginated<Content> | null>(null);
  const [pages, setPages] = useState<Paginated<Content> | null>(null);
  const [published, setPublished] = useState<Content[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [pending, setPending] = useState(0);
  const [theme, setTheme] = useState('default');
  const [user, setUser] = useState<User | null>(null);
  const [welcome, setWelcome] = useState(true);
  const [screenOpen, setScreenOpen] = useState(false);
  const [shown, setShown] = useState<Record<WidgetKey, boolean>>({
    glance: true,
    activity: true,
    draft: true,
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    setWelcome(localStorage.getItem('op_welcome_dismissed') !== '1');
    const stored = localStorage.getItem('op_dashboard_widgets');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<Record<WidgetKey, boolean>>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setShown((current) => ({
            glance: typeof parsed.glance === 'boolean' ? parsed.glance : current.glance,
            activity: typeof parsed.activity === 'boolean' ? parsed.activity : current.activity,
            draft: typeof parsed.draft === 'boolean' ? parsed.draft : current.draft,
          }));
        }
      } catch {
        /* keep defaults */
      }
    }
    api<User>('/auth/me')
      .then((me) => {
        setUser(me);
        if (me.role === 'AUTHOR') return;
        api<Paginated<Content>>('/content?type=PAGE&perPage=1').then(setPages).catch(() => {});
        api<Comment[]>('/comments')
          .then((rows) =>
            setComments(
              rows.filter((row) => row.status === 'APPROVED' || row.status === 'PENDING').slice(0, 5),
            ),
          )
          .catch(() => {});
        api<Comment[]>('/comments?status=PENDING')
          .then((rows) => setPending(rows.length))
          .catch(() => {});
      })
      .catch(() => {});
    api<Paginated<Content>>('/content?type=POST&perPage=1').then(setPosts).catch(() => {});
    api<Paginated<Content>>('/content?type=POST&status=PUBLISHED&perPage=5')
      .then((data) => setPublished(data.items))
      .catch(() => {});
    api<SiteSettings>('/settings')
      .then((settings) => setTheme(settings.activeTheme || 'default'))
      .catch(() => {});
  }, []);

  function toggleWidget(key: WidgetKey) {
    setShown((current) => {
      const next = { ...current, [key]: !current[key] };
      localStorage.setItem('op_dashboard_widgets', JSON.stringify(next));
      return next;
    });
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setDraftError('Title is required.');
      return;
    }
    setSaving(true);
    setDraftError('');
    setSavedId(null);
    try {
      const created = await api<Content>('/content', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          type: 'POST',
          status: 'DRAFT',
          excerpt: body.trim().slice(0, 280) || undefined,
          blocks: body.trim()
            ? [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: body.trim(), styles: {} }],
                },
              ]
            : [],
        }),
      });
      setSavedId(created.id);
      setTitle('');
      setBody('');
      const fresh = await api<Paginated<Content>>('/content?type=POST&perPage=1');
      setPosts(fresh);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Could not save the draft.');
    } finally {
      setSaving(false);
    }
  }

  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'ADMIN' || user?.role === 'EDITOR';

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-4">
        <h1 className="text-[23px] font-normal leading-tight">Dashboard</h1>
        <button
          type="button"
          aria-expanded={screenOpen}
          onClick={() => setScreenOpen((open) => !open)}
          className="border border-[#c3c4c7] bg-white px-2 py-1 text-[13px] text-[#3858e9] hover:border-[#3858e9]"
        >
          Screen Options
        </button>
      </div>

      {screenOpen ? (
        <div className="mb-4 border border-[#c3c4c7] bg-white px-4 py-3 text-[13px]">
          <p className="mb-2 font-semibold">Widgets</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {WIDGETS.map((widget) => (
              <label key={widget.key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={shown[widget.key]}
                  onChange={() => toggleWidget(widget.key)}
                />
                {widget.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {welcome ? (
        <section className="op-welcome">
          <div className="op-welcome-header">
            <div>
              <h2>Welcome to OpenPress</h2>
              <p>Posts, pages, media, and comments for this site are managed from here.</p>
            </div>
            <button
              type="button"
              className="text-[13px] text-[#c3c4c7] hover:text-white"
              onClick={() => {
                localStorage.setItem('op_welcome_dismissed', '1');
                setWelcome(false);
              }}
            >
              Dismiss
            </button>
          </div>
          <div className="op-welcome-cols">
            <div>
              <h3 className="mb-2 font-semibold">Get started</h3>
              <ul className="space-y-1">
                <li>
                  <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/posts/new">
                    <span className="dashicons dashicons-admin-post" />
                    Write a post
                  </Link>
                </li>
                {isStaff ? (
                  <li>
                    <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/pages/new">
                      <span className="dashicons dashicons-admin-page" />
                      Add a page
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/media/new">
                    <span className="dashicons dashicons-admin-media" />
                    Upload media
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Next steps</h3>
              <ul className="space-y-1">
                {isStaff ? (
                  <li>
                    <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/comments">
                      <span className="dashicons dashicons-admin-comments" />
                      Moderate comments
                      {pending > 0 ? ` (${pending})` : ''}
                    </Link>
                  </li>
                ) : null}
                <li>
                  <a className="text-[#3858e9] hover:text-[#183ad6]" href="/" target="_blank" rel="noreferrer">
                    <span className="dashicons dashicons-external" />
                    View your site
                  </a>
                </li>
              </ul>
            </div>
            {isAdmin ? (
              <div>
                <h3 className="mb-2 font-semibold">More actions</h3>
                <ul className="space-y-1">
                  <li>
                    <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/themes">
                      <span className="dashicons dashicons-admin-appearance" />
                      Choose a theme
                    </Link>
                  </li>
                  <li>
                    <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/settings">
                      <span className="dashicons dashicons-admin-settings" />
                      Edit site settings
                    </Link>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {shown.glance ? (
            <Postbox title="At a Glance">
              <ul className="space-y-1 text-[13px]">
                <li>
                  <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/posts">
                    {posts
                      ? `${posts.total} ${posts.total === 1 ? 'Post' : 'Posts'}`
                      : '—'}
                  </Link>
                </li>
                {isStaff ? (
                  <li>
                    <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/pages">
                      {pages
                        ? `${pages.total} ${pages.total === 1 ? 'Page' : 'Pages'}`
                        : '—'}
                    </Link>
                  </li>
                ) : null}
                {isStaff ? (
                  <li>
                    <Link className="text-[#3858e9] hover:text-[#183ad6]" href="/admin/comments">
                      {pending} in moderation
                    </Link>
                  </li>
                ) : null}
              </ul>
              {isAdmin ? (
                <p className="mt-3 border-t border-[#dcdcde] pt-3 text-[13px] text-[#50575e]">
                  Theme: <span className="text-[#1d2327]">{theme}</span>
                </p>
              ) : null}
            </Postbox>
          ) : null}

          {shown.activity ? (
            <Postbox title="Activity">
              <h3 className="mb-2 text-[13px] font-semibold">Recently published</h3>
              <ul className="mb-4 space-y-2 text-[13px]">
                {published.map((post) => (
                  <li key={post.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link className="text-[#3858e9] hover:text-[#183ad6]" href={`/admin/posts/${post.id}`}>
                      {post.title}
                    </Link>
                    <time className="text-[#50575e]" dateTime={post.publishedAt ?? post.updatedAt}>
                      {formatWhen(post.publishedAt ?? post.updatedAt)}
                    </time>
                  </li>
                ))}
                {published.length === 0 ? (
                  <li className="text-[#50575e]">No published posts yet.</li>
                ) : null}
              </ul>
              {isStaff ? (
                <>
                  <h3 className="mb-2 text-[13px] font-semibold">Recent comments</h3>
                  <ul className="space-y-2 text-[13px]">
                    {comments.map((comment) => (
                      <li key={comment.id}>
                        <span className="font-medium">
                          {comment.author?.name || comment.guestName || 'Guest'}
                        </span>{' '}
                        <span className="text-[#50575e]">on</span>{' '}
                        <Link
                          className="text-[#3858e9] hover:text-[#183ad6]"
                          href="/admin/comments"
                        >
                          {comment.content?.title || 'a post'}
                        </Link>
                        <p className="mt-0.5 line-clamp-2 text-[#50575e]">{comment.body}</p>
                      </li>
                    ))}
                    {comments.length === 0 ? (
                      <li className="text-[#50575e]">No comments yet.</li>
                    ) : null}
                  </ul>
                </>
              ) : null}
            </Postbox>
          ) : null}
        </div>

        {shown.draft ? (
          <Postbox title="Quick Draft">
            <form onSubmit={saveDraft} className="space-y-3 text-[13px]">
              <label className="block">
                <span className="mb-1 block">Title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full border border-[#8c8f94] px-2 py-1 outline-none focus:border-[#3858e9] focus:shadow-[0_0_0_1px_#3858e9]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block">Content</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  className="w-full border border-[#8c8f94] px-2 py-1 outline-none focus:border-[#3858e9] focus:shadow-[0_0_0_1px_#3858e9]"
                />
              </label>
              {draftError ? <p className="text-[#d63638]">{draftError}</p> : null}
              {savedId ? (
                <p>
                  Draft saved.{' '}
                  <Link className="text-[#3858e9] hover:text-[#183ad6]" href={`/admin/posts/${savedId}`}>
                    Edit
                  </Link>
                </p>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="border border-[#3858e9] bg-[#3858e9] px-3 py-1 text-white hover:bg-[#2145e6] disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
            </form>
          </Postbox>
        ) : null}
      </div>
    </div>
  );
}

function Postbox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[#c3c4c7] bg-white shadow-sm">
      <h2 className="border-b border-[#c3c4c7] bg-[#f6f7f7] px-3 py-2 text-[14px] font-semibold">
        {title}
      </h2>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
