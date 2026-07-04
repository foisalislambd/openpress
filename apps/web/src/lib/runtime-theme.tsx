import React from 'react';
import type {
  Content,
  ThemeArchiveProps,
  ThemeDefinition,
  ThemeHomeProps,
  ThemeLayoutProps,
  ThemeSingleProps,
} from '@openpress/shared';
import { BlockRenderer } from '@openpress/theme-default';

// Runtime theme engine ("runtime-v1"): renders uploaded themes described by
// a theme.json manifest with design tokens + optional style.css.

export interface RuntimeThemeManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  engine: 'runtime-v1';
  tokens: Record<string, string>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Tokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  headerBackground: string;
  headerText: string;
  font: string;
  radius: string;
  layout: 'cards' | 'list';
  maxWidth: string;
}

function normalizeTokens(raw: Record<string, string>): Tokens {
  return {
    background: raw.background ?? '#ffffff',
    surface: raw.surface ?? '#f7f7f8',
    text: raw.text ?? '#18181b',
    muted: raw.muted ?? '#71717a',
    accent: raw.accent ?? '#4f46e5',
    accentText: raw.accentText ?? '#ffffff',
    headerBackground: raw.headerBackground ?? raw.accent ?? '#4f46e5',
    headerText: raw.headerText ?? '#ffffff',
    font:
      raw.font === 'serif'
        ? "Georgia, 'Times New Roman', serif"
        : raw.font === 'mono'
          ? "'Cascadia Code', Consolas, monospace"
          : "system-ui, -apple-system, 'Segoe UI', sans-serif",
    radius: raw.radius ?? '0.75rem',
    layout: raw.layout === 'list' ? 'list' : 'cards',
    maxWidth: raw.maxWidth ?? '56rem',
  };
}

function formatDate(date?: string | null) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildRuntimeTheme(
  manifest: RuntimeThemeManifest,
): ThemeDefinition {
  const t = normalizeTokens(manifest.tokens ?? {});

  function PostCard({ post }: { post: Content }) {
    return (
      <article
        style={{
          background: t.surface,
          borderRadius: t.radius,
          padding: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
          <a href={`/${post.slug}`} style={{ color: t.text, textDecoration: 'none' }}>
            {post.title}
          </a>
        </h2>
        {post.excerpt ? (
          <p style={{ color: t.muted, fontSize: '0.9rem', lineHeight: 1.6 }}>
            {post.excerpt}
          </p>
        ) : null}
        <div style={{ color: t.muted, fontSize: '0.8rem', marginTop: '0.75rem' }}>
          {post.author?.name} &middot; {formatDate(post.publishedAt)}
        </div>
      </article>
    );
  }

  function PostGrid({ posts }: { posts: ThemeHomeProps['posts'] }) {
    return (
      <div
        style={
          t.layout === 'cards'
            ? {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '1.25rem',
              }
            : { display: 'flex', flexDirection: 'column', gap: '1.25rem' }
        }
      >
        {posts.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    );
  }

  function Pager({ page, totalPages }: { page: number; totalPages: number }) {
    if (totalPages <= 1) return null;
    const link = {
      color: t.accent,
      textDecoration: 'none',
      fontWeight: 600,
      fontSize: '0.9rem',
    } as const;
    return (
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '2.5rem',
        }}
      >
        {page > 1 ? <a href={`?page=${page - 1}`} style={link}>&larr; Newer</a> : <span />}
        {page < totalPages ? <a href={`?page=${page + 1}`} style={link}>Older &rarr;</a> : <span />}
      </nav>
    );
  }

  function Layout({ settings, pages, children }: ThemeLayoutProps) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: t.background,
          color: t.text,
          fontFamily: t.font,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link
          rel="stylesheet"
          href={`${API_URL}/api/themes/installed/${manifest.id}/style.css`}
        />
        <header
          style={{ background: t.headerBackground, color: t.headerText }}
          className="rt-header"
        >
          <div
            style={{
              maxWidth: t.maxWidth,
              margin: '0 auto',
              padding: '1.25rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <a
              href="/"
              style={{
                color: t.headerText,
                fontWeight: 800,
                fontSize: '1.25rem',
                textDecoration: 'none',
              }}
            >
              {settings.siteTitle}
            </a>
            <nav style={{ display: 'flex', gap: '1.25rem' }}>
              <a href="/" style={{ color: t.headerText, opacity: 0.9, textDecoration: 'none', fontSize: '0.9rem' }}>
                Home
              </a>
              {pages.map((p) => (
                <a
                  key={p.id}
                  href={`/${p.slug}`}
                  style={{ color: t.headerText, opacity: 0.9, textDecoration: 'none', fontSize: '0.9rem' }}
                >
                  {p.title}
                </a>
              ))}
            </nav>
          </div>
        </header>
        <main
          style={{
            maxWidth: t.maxWidth,
            width: '100%',
            margin: '0 auto',
            padding: '2.5rem 1rem',
            flex: 1,
          }}
        >
          {children}
        </main>
        <footer
          style={{
            borderTop: `1px solid ${t.surface}`,
            padding: '1.5rem',
            textAlign: 'center',
            color: t.muted,
            fontSize: '0.85rem',
          }}
        >
          {settings.siteTitle} &mdash; powered by OpenPress ({manifest.name})
        </footer>
      </div>
    );
  }

  function Home({ settings, posts }: ThemeHomeProps) {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0 }}>
            {settings.siteTitle}
          </h1>
          <p style={{ color: t.muted }}>{settings.siteDescription}</p>
        </div>
        <PostGrid posts={posts} />
        <Pager page={posts.page} totalPages={posts.totalPages} />
      </div>
    );
  }

  function Post({ content, comments }: ThemeSingleProps) {
    return (
      <article>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0 }}>
            {content.title}
          </h1>
          <div style={{ color: t.muted, fontSize: '0.9rem', marginTop: '0.5rem' }}>
            By {content.author?.name} on {formatDate(content.publishedAt)}
          </div>
        </header>
        <BlockRenderer blocks={content.blocks} />
        <section style={{ marginTop: '3rem', borderTop: `1px solid ${t.surface}`, paddingTop: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            Comments ({comments.length})
          </h2>
          {comments.length === 0 ? (
            <p style={{ color: t.muted, fontSize: '0.9rem' }}>No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                style={{
                  background: t.surface,
                  borderRadius: t.radius,
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {c.author?.name ?? c.guestName ?? 'Anonymous'}
                </div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.95rem' }}>{c.body}</p>
              </div>
            ))
          )}
        </section>
      </article>
    );
  }

  function Page({ content }: ThemeSingleProps) {
    return (
      <article>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '2rem' }}>
          {content.title}
        </h1>
        <BlockRenderer blocks={content.blocks} />
      </article>
    );
  }

  function Archive({ title, posts }: ThemeArchiveProps) {
    return (
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '2rem' }}>
          {title}
        </h1>
        <PostGrid posts={posts} />
        <Pager page={posts.page} totalPages={posts.totalPages} />
      </div>
    );
  }

  return {
    manifest: {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description ?? '',
      author: manifest.author ?? '',
      version: manifest.version,
    },
    Layout,
    Home,
    Post,
    Page,
    Archive,
  };
}
