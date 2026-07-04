// Server-side API helpers (used by public site RSC pages)
import type {
  Comment,
  Content,
  Paginated,
  SiteSettings,
} from '@openpress/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    next: { revalidate: 10 },
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export async function getSettings(): Promise<SiteSettings> {
  try {
    return await get<SiteSettings>('/settings');
  } catch {
    return {
      siteTitle: 'OpenPress',
      siteDescription: '',
      activeTheme: 'default',
      homepageType: 'latest-posts',
      homepageId: null,
      postsPerPage: 10,
    };
  }
}

export function getPublicPosts(params: Record<string, string | number>) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  return get<Paginated<Content>>(`/content/public?type=POST&${qs}`);
}

export function getPublicPages() {
  return get<Paginated<Content>>('/content/public?type=PAGE&perPage=20').catch(
    () => ({ items: [], total: 0, page: 1, perPage: 20, totalPages: 0 }),
  );
}

export function getPublicContentBySlug(slug: string) {
  return get<Content>(`/content/public/slug/${encodeURIComponent(slug)}`);
}

export function getPublicContentById(id: string) {
  return get<Content>(`/content/public/id/${encodeURIComponent(id)}`);
}

export function getComments(contentId: string) {
  return get<Comment[]>(`/comments/content/${contentId}`).catch(() => []);
}
