import type { ComponentType } from 'react';
import type { Content, ThemeArchiveProps, ThemeDefinition, ThemeHomeProps, ThemeLayoutProps, ThemeSingleProps } from '@openpress/shared';
import { BlockRenderer } from '@openpress/theme-default';
import { renderThemeTemplate, splitYield } from '../../../../packages/theme-sdk/src/templates';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type TemplateFiles = Record<string, string>;

export async function buildTemplateTheme(manifest: {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  templates?: string[];
}): Promise<ThemeDefinition> {
  const names = [...new Set([...(manifest.templates ?? []), 'layout', 'index', 'single', 'page', 'archive', 'header', 'footer'])];
  const files: TemplateFiles = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`${API_URL}/api/themes/installed/${manifest.id}/template?name=${encodeURIComponent(name)}`, {
          next: { revalidate: 10 },
        });
        if (!res.ok) return;
        const body = (await res.json()) as { html?: string };
        if (body.html) files[name] = body.html;
      } catch {
        // A missing template falls through to the next view.
      }
    }),
  );
  const siteData = (settings: { siteTitle: string; siteDescription?: string }) => ({
    site: { title: settings.siteTitle, description: settings.siteDescription ?? '' },
  });
  const Layout = (({ settings, children }: ThemeLayoutProps) => {
    const html = renderThemeTemplate(files.layout || '<header><h1>{{site.title}}</h1></header>{{yield}}<footer></footer>', siteData(settings));
    const parts = splitYield(html);
    return (
      <div>
        <link rel="stylesheet" href={`${API_URL}/api/themes/installed/${manifest.id}/style.css`} />
        <div dangerouslySetInnerHTML={{ __html: parts.before }} />
        {children}
        <div dangerouslySetInnerHTML={{ __html: parts.after }} />
      </div>
    );
  }) as ComponentType<ThemeLayoutProps>;
  const Home = (({ settings, posts }: ThemeHomeProps) => {
    const html = renderThemeTemplate(files.index || files.home || '<h1>{{site.title}}</h1>{{#posts}}<p><a href="{{url}}">{{title}}</a></p>{{/posts}}', {
      ...siteData(settings),
      posts: posts.items.map((item) => ({
        title: item.title,
        excerpt: item.excerpt ?? '',
        url: item.permalink || `/${item.slug}`,
      })),
    });
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }) as ComponentType<ThemeHomeProps>;
  const single = (file: string | undefined) =>
    ((props: ThemeSingleProps) => <SingleTemplate source={file} {...props} />) as ComponentType<ThemeSingleProps>;
  const Archive = (({ settings, title, posts }: ThemeArchiveProps) => {
    const html = renderThemeTemplate(files.archive || files.index || '<h1>{{title}}</h1>', {
      ...siteData(settings),
      title,
      posts: posts.items.map((item) => ({ title: item.title, excerpt: item.excerpt ?? '', url: item.permalink || `/${item.slug}` })),
    });
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }) as ComponentType<ThemeArchiveProps>;
  return {
    manifest: {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description || '',
      author: manifest.author || '',
      version: manifest.version,
    },
    Layout,
    Home,
    Post: single(files.single || files.index),
    Page: single(files.page || files.single || files.index),
    Archive,
    templates: {
      ...(files['front-page'] ? { 'front-page': Home } : {}),
      ...(files.home ? { home: Home } : {}),
      ...(files.single ? { single: single(files.single) } : {}),
      ...(files.page ? { page: single(files.page) } : {}),
      ...(files.archive ? { archive: Archive } : {}),
      index: Home,
    },
  };
}

function SingleTemplate({ source, settings, content }: ThemeSingleProps & { source?: string }) {
  const html = renderThemeTemplate(source || '<h1>{{title}}</h1><p>{{excerpt}}</p>{{yield}}', {
    site: { title: settings.siteTitle, description: settings.siteDescription ?? '' },
    title: content.title,
    excerpt: content.excerpt ?? '',
  });
  const parts = splitYield(html);
  return (
    <article>
      <div dangerouslySetInnerHTML={{ __html: parts.before }} />
      <BlockRenderer blocks={content.blocks as Content['blocks']} />
      <div dangerouslySetInnerHTML={{ __html: parts.after }} />
    </article>
  );
}
