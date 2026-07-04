import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getComments, getPublicContentBySlug, getSettings } from '@/lib/api';
import { getTheme } from '@/lib/themes';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const content = await getPublicContentBySlug(slug);
    const seo = content.seo as { title?: string; description?: string };
    return {
      title: seo.title || content.title,
      description: seo.description || content.excerpt || undefined,
    };
  } catch {
    return {};
  }
}

export default async function ContentPage({ params }: Props) {
  const { slug } = await params;
  const settings = await getSettings();
  const theme = getTheme(settings.activeTheme);

  let content;
  try {
    content = await getPublicContentBySlug(slug);
  } catch {
    notFound();
  }

  const comments = await getComments(content.id);
  const Component = content.type === 'PAGE' ? theme.Page : theme.Post;
  return <Component settings={settings} content={content} comments={comments} />;
}
