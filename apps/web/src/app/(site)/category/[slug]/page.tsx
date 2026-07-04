import { getPublicPosts, getSettings } from '@/lib/api';
import { resolveTheme } from '@/lib/themes';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page } = await searchParams;
  const settings = await getSettings();
  const theme = await resolveTheme(settings.activeTheme);
  const posts = await getPublicPosts({
    category: slug,
    page: page ?? 1,
    perPage: settings.postsPerPage ?? 10,
  }).catch(() => ({ items: [], total: 0, page: 1, perPage: 10, totalPages: 0 }));
  const { Archive } = theme;
  return (
    <Archive settings={settings} title={`Category: ${slug}`} posts={posts} />
  );
}
