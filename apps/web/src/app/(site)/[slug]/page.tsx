import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PasswordGate } from '@/components/password-gate';
import { getComments, getPublicContentBySlug, getSettings } from '@/lib/api';
import { resolveTheme } from '@/lib/themes';
import { renderTemplate } from '@/lib/templates';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const content = await getPublicContentBySlug(slug);
    const seo = content.seoHead;
    const legacy = content.seo as { title?: string; description?: string };
    const languages = Object.fromEntries((seo?.hreflang ?? []).map((item) => [item.locale, item.href]));
    return {
      title: seo?.title || legacy.title || content.title,
      description: seo?.description || legacy.description || content.excerpt || undefined,
      alternates: {
        canonical: seo?.canonical,
        languages: Object.keys(languages).length ? languages : undefined,
      },
      robots: seo?.robots,
      openGraph: seo
        ? {
            title: String(seo.openGraph.title ?? seo.title),
            description: String(seo.openGraph.description ?? seo.description),
            url: String(seo.openGraph.url ?? seo.canonical),
            images: Array.isArray(seo.openGraph.images) ? seo.openGraph.images.map(String) : undefined,
          }
        : undefined,
      twitter: seo
        ? {
            card: seo.twitter.card === 'summary_large_image' ? 'summary_large_image' : 'summary',
            title: String(seo.twitter.title ?? seo.title),
            description: String(seo.twitter.description ?? seo.description),
            images: seo.twitter.image ? [String(seo.twitter.image)] : undefined,
          }
        : undefined,
    };
  } catch {
    return {};
  }
}

export default async function ContentPage({ params }: Props) {
  const { slug } = await params;
  const settings = await getSettings();
  const theme = await resolveTheme(settings.activeTheme);
  const jar = await cookies();
  const unlock = jar.get(`op_unlock_${slug}`)?.value;

  let content;
  try {
    content = await getPublicContentBySlug(slug, unlock ? decodeURIComponent(unlock) : undefined);
  } catch {
    notFound();
  }

  if (content.passwordRequired) {
    return <PasswordGate slug={slug} title={content.title} excerpt={content.excerpt} />;
  }

  const comments = await getComments(content.id);
  const fallback = content.type === 'PAGE' ? theme.Page : theme.Post;
  return (
    <>
      {content.seoHead ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(content.seoHead.jsonLd) }} />
      ) : null}
      {renderTemplate(theme, content.templates ?? [], fallback, { settings, content, comments })}
    </>
  );
}
