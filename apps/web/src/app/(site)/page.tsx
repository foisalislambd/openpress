import { getPublicPosts, getSettings } from '@/lib/api';
import { getTheme } from '@/lib/themes';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const settings = await getSettings();
  const theme = getTheme(settings.activeTheme);
  const posts = await getPublicPosts({
    page: page ?? 1,
    perPage: settings.postsPerPage ?? 10,
  }).catch(() => ({
    items: [],
    total: 0,
    page: 1,
    perPage: 10,
    totalPages: 0,
  }));
  const { Home } = theme;
  return <Home settings={settings} posts={posts} />;
}
