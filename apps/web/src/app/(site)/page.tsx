import {
  getComments,
  getPublicContentById,
  getPublicPosts,
  getSettings,
} from '@/lib/api';
import { resolveTheme } from '@/lib/themes';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const settings = await getSettings();
  const theme = await resolveTheme(settings.activeTheme);

  // "Reading" setting: homepage can be a static page instead of latest posts
  if (settings.homepageType === 'static-page' && settings.homepageId) {
    try {
      const content = await getPublicContentById(settings.homepageId);
      const comments = await getComments(content.id);
      const { Page } = theme;
      return <Page settings={settings} content={content} comments={comments} />;
    } catch {
      // fall back to latest posts if the page was deleted/unpublished
    }
  }

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
