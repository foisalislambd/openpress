import React from 'react';
import type {
  ThemeArchiveProps,
  ThemeDefinition,
  ThemeHomeProps,
  ThemeLayoutProps,
  ThemeSingleProps,
} from '@openpress/shared';
import { BlockRenderer } from './blocks';
import { CommentForm } from './comment-form';
import { CommentList, Pagination, PostCard, formatDate } from './components';

type MenuItem = { label: string; url: string };
type NavMenu = { name?: string; items?: MenuItem[] };

function menusOf(settings: ThemeLayoutProps['settings']) {
  return Array.isArray(settings.menus) ? (settings.menus as NavMenu[]) : [];
}

function itemsFor(settings: ThemeLayoutProps['settings'], location: 'primary' | 'footer', pages: ThemeLayoutProps['pages']) {
  const menus = menusOf(settings);
  const locations = (settings.menuLocations ?? {}) as { primary?: string; footer?: string };
  const wanted = locations[location];
  const menu = (wanted ? menus.find((item) => item.name === wanted) : undefined) ?? (location === 'primary' ? menus[0] : undefined);
  const items = menu?.items?.filter((item) => item?.label && item?.url) ?? [];
  if (items.length > 0 || location === 'footer') return items;
  return [
    { label: 'Home', url: '/' },
    ...pages.map((page) => ({ label: page.title, url: `/${page.slug}` })),
  ];
}

function Layout({ settings, pages, children }: ThemeLayoutProps) {
  const items = itemsFor(settings, 'primary', pages);
  const footerItems = itemsFor(settings, 'footer', pages);
  const chrome = (settings.pluginChrome ?? {}) as {
    assets?: { href: string; kind: 'style' | 'script'; handle: string }[];
    widgets?: { footer?: string[]; sidebar?: string[] };
  };
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <a href="/" className="text-lg font-extrabold tracking-tight">
            {settings.siteTitle}
          </a>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {items.map((item) => (
              <a key={`${item.url}-${item.label}`} href={item.url} className="hover:text-indigo-600">
                {item.label}
              </a>
            ))}
            <a href="/search" className="hover:text-indigo-600">Search</a>
            <a href="/feed" className="hover:text-indigo-600">RSS</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-4xl flex-1 gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>{children}</div>
        {chrome.widgets?.sidebar?.length ? (
          <aside className="space-y-3 text-sm text-zinc-600">
            {chrome.widgets.sidebar.map((html) => (
              <p key={html}>{html}</p>
            ))}
          </aside>
        ) : null}
      </main>
      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
        {chrome.assets?.map((asset) =>
          asset.kind === 'style' ? (
            <link key={asset.handle} rel="stylesheet" href={asset.href} />
          ) : (
            <script key={asset.handle} src={asset.href} defer />
          ),
        )}
        {footerItems.length ? (
          <nav className="mb-3 flex justify-center gap-4">
            {footerItems.map((item) => (
              <a key={`${item.url}-${item.label}`} href={item.url}>
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}
        {chrome.widgets?.footer?.map((html) => (
          <p key={html} className="mb-2">
            {html}
          </p>
        ))}
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
        <CommentForm contentId={content.id} closed={content.commentStatus === 'closed'} />
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
