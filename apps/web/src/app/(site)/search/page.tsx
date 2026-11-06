import type { Metadata } from 'next';
import { getPublicPosts, getSettings } from '@/lib/api';
import { resolveTheme } from '@/lib/themes';
import { renderTemplate } from '@/lib/templates';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = '', page = '1' } = await searchParams;
  const settings = await getSettings();
  const theme = await resolveTheme(settings.activeTheme);
  const query = q.trim();
  const posts = query
    ? await getPublicPosts({ search: query, page, perPage: settings.postsPerPage ?? 10 }).catch(() => ({
        items: [],
        total: 0,
        page: 1,
        perPage: 10,
        totalPages: 0,
      }))
    : { items: [], total: 0, page: 1, perPage: 10, totalPages: 0 };
  return (
    <div>
      <form action="/search" className="mb-8 flex gap-2">
        <label className="sr-only" htmlFor="q">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="Search posts"
          className="w-full rounded border border-zinc-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
          Search
        </button>
      </form>
      {renderTemplate(theme, ['search', 'archive'], theme.Archive, {
        settings,
        title: query ? `Search results for “${query}”` : 'Search',
        posts,
      })}
    </div>
  );
}
