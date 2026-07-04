import React from 'react';
import type {
  ThemeArchiveProps,
  ThemeDefinition,
  ThemeHomeProps,
  ThemeLayoutProps,
  ThemeSingleProps,
} from '@openpress/shared';
import { BlockRenderer } from '@openpress/theme-default';

function formatDate(date?: string | null) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function Layout({ settings, pages, children }: ThemeLayoutProps) {
  return (
    <div className="min-h-screen bg-white font-serif text-stone-800">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-14 text-center">
          <a href="/" className="text-2xl font-bold tracking-tight text-stone-900">
            {settings.siteTitle}
          </a>
          <nav className="mt-3 flex justify-center gap-6 font-sans text-sm text-stone-500">
            <a href="/" className="hover:text-stone-900">Home</a>
            {pages.map((p) => (
              <a key={p.id} href={`/${p.slug}`} className="hover:text-stone-900">
                {p.title}
              </a>
            ))}
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mt-20 border-t border-stone-200 pt-6 text-center font-sans text-xs text-stone-400">
          {settings.siteTitle} &mdash; powered by OpenPress
        </footer>
      </div>
    </div>
  );
}

function PostRow({ post }: { post: ThemeHomeProps['posts']['items'][number] }) {
  return (
    <article className="border-b border-stone-100 py-8">
      <time className="font-sans text-xs uppercase tracking-widest text-stone-400">
        {formatDate(post.publishedAt)}
      </time>
      <h2 className="mt-1 text-2xl font-bold text-stone-900">
        <a href={`/${post.slug}`} className="hover:underline">
          {post.title}
        </a>
      </h2>
      {post.excerpt ? (
        <p className="mt-2 leading-relaxed text-stone-600">{post.excerpt}</p>
      ) : null}
    </article>
  );
}

function Pager({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-10 flex justify-between font-sans text-sm text-stone-500">
      {page > 1 ? <a href={`?page=${page - 1}`} className="hover:text-stone-900">&larr; Newer</a> : <span />}
      {page < totalPages ? <a href={`?page=${page + 1}`} className="hover:text-stone-900">Older &rarr;</a> : <span />}
    </nav>
  );
}

function Home({ posts }: ThemeHomeProps) {
  return (
    <div>
      {posts.items.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
      <Pager page={posts.page} totalPages={posts.totalPages} />
    </div>
  );
}

function Post({ content, comments }: ThemeSingleProps) {
  return (
    <article>
      <header className="mb-10 text-center">
        <time className="font-sans text-xs uppercase tracking-widest text-stone-400">
          {formatDate(content.publishedAt)}
        </time>
        <h1 className="mt-2 text-4xl font-bold text-stone-900">{content.title}</h1>
        <p className="mt-3 font-sans text-sm text-stone-500">
          by {content.author?.name}
        </p>
      </header>
      <BlockRenderer blocks={content.blocks} />
      <section className="mt-16 border-t border-stone-200 pt-8">
        <h2 className="mb-6 font-sans text-sm font-bold uppercase tracking-widest text-stone-400">
          Comments ({comments.length})
        </h2>
        {comments.length === 0 ? (
          <p className="font-sans text-sm text-stone-400">No comments yet.</p>
        ) : (
          <ul className="space-y-6">
            {comments.map((c) => (
              <li key={c.id}>
                <div className="font-sans text-sm font-semibold text-stone-700">
                  {c.author?.name ?? c.guestName ?? 'Anonymous'}
                </div>
                <p className="mt-1 text-stone-600">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function Page({ content }: ThemeSingleProps) {
  return (
    <article>
      <h1 className="mb-10 text-center text-4xl font-bold text-stone-900">
        {content.title}
      </h1>
      <BlockRenderer blocks={content.blocks} />
    </article>
  );
}

function Archive({ title, posts }: ThemeArchiveProps) {
  return (
    <div>
      <h1 className="mb-6 text-center text-2xl font-bold text-stone-900">{title}</h1>
      {posts.items.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
      <Pager page={posts.page} totalPages={posts.totalPages} />
    </div>
  );
}

const theme: ThemeDefinition = {
  manifest: {
    id: 'minimal',
    name: 'Minimal',
    description: 'A quiet, typography-focused theme for writers.',
    author: 'OpenPress',
    version: '0.1.0',
  },
  Layout,
  Home,
  Post,
  Page,
  Archive,
};

export default theme;
