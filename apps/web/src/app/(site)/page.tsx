import {
  getComments,
  getPublicContentById,
  getPublicPosts,
  getSettings,
} from '@/lib/api';
import { resolveTheme } from '@/lib/themes';
import { renderTemplate } from '@/lib/templates';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const settings = await getSettings();
  const theme = await resolveTheme(settings.activeTheme);

  // "Reading" setting: homepage can be a static page instead of latest posts
  let staticPage: { content: Awaited<ReturnType<typeof getPublicContentById>>; comments: Awaited<ReturnType<typeof getComments>> } | null = null;
  if (settings.homepageType === 'static-page' && settings.homepageId) {
    try {
      const content = await getPublicContentById(settings.homepageId);
      const comments = await getComments(content.id);
      staticPage = { content, comments };
    } catch {
      staticPage = null;
    }
  }
  if (staticPage) {
    return renderTemplate(theme, staticPage.content.templates ?? ['single-page', 'page'], theme.Page, {
      settings,
      content: staticPage.content,
      comments: staticPage.comments,
    });
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
  return renderTemplate(theme, ['front-page', 'home'], theme.Home, { settings, posts });
}
