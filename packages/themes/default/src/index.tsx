import React from 'react';
import type {
  ThemeArchiveProps,
  ThemeDefinition,
  ThemeHomeProps,
  ThemeLayoutProps,
  ThemeSingleProps,
} from '@openpress/shared';
import { BlockRenderer } from './blocks';
import { CommentList, Pagination, PostCard, formatDate } from './components';

function Layout({ settings, pages, children }: ThemeLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <a href="/" className="text-lg font-extrabold tracking-tight">
            {settings.siteTitle}
          </a>
          <nav className="flex gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            <a href="/" className="hover:text-indigo-600">Home</a>
            {pages.map((p) => (
              <a key={p.id} href={`/${p.slug}`} className="hover:text-indigo-600">
                {p.title}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        {settings.siteTitle} &mdash; powered by{' '}
        <a href="https://github.com" className="font-medium hover:text-indigo-600">
          OpenPress
        </a>
      </footer>
    </div>
  );
}

function Home({ settings, posts }: ThemeHomeProps) {
  return (
    <div>
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">{settings.siteTitle}</h1>
        <p className="mt-2 text-zinc-500">{settings.siteDescription}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {posts.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <Pagination page={posts.page} totalPages={posts.totalPages} basePath="/" />
    </div>
  );
}

function Post({ content, comments }: ThemeSingleProps) {
  return (
    <article>
      <header className="mb-8">
        <div className="flex flex-wrap gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          {content.categories?.map((c) => (
            <a key={c.id} href={`/category/${c.slug}`} className="hover:underline">
              {c.name}
            </a>
          ))}
        </div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{content.title}</h1>
        <div className="mt-3 text-sm text-zinc-500">
          By {content.author?.name} on <time>{formatDate(content.publishedAt)}</time>
        </div>
        {content.coverImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={content.coverImage}
            alt={content.title}
            className="mt-6 w-full rounded-2xl object-cover"
          />
        ) : null}
      </header>
      <BlockRenderer blocks={content.blocks} />
      {content.tags?.length ? (
        <div className="mt-8 flex flex-wrap gap-2">
          {content.tags.map((t) => (
            <a
              key={t.id}
              href={`/tag/${t.slug}`}
              className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300"
            >
              #{t.name}
            </a>
          ))}
        </div>
      ) : null}
      <section className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="mb-6 text-xl font-bold">Comments</h2>
        <CommentList comments={comments} />
      </section>
    </article>
  );
}

function Page({ content }: ThemeSingleProps) {
  return (
    <article>
      <h1 className="mb-8 text-4xl font-extrabold tracking-tight">{content.title}</h1>
      <BlockRenderer blocks={content.blocks} />
    </article>
  );
}

function Archive({ title, posts }: ThemeArchiveProps) {
  return (
    <div>
      <h1 className="mb-8 text-3xl font-extrabold tracking-tight">{title}</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        {posts.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <Pagination page={posts.page} totalPages={posts.totalPages} basePath="?" />
    </div>
  );
}

const theme: ThemeDefinition = {
  manifest: {
    id: 'default',
    name: 'OpenPress Default',
    description: 'A clean, modern default theme for OpenPress.',
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
export { BlockRenderer };
