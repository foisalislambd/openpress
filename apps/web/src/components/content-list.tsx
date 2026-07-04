'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Content, Paginated } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Badge, Button, Input, Select, statusBadgeColor } from '@/components/ui';

export function ContentList({ type }: { type: 'POST' | 'PAGE' }) {
  const [data, setData] = useState<Paginated<Content> | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const label = type === 'POST' ? 'Posts' : 'Pages';
  const base = type === 'POST' ? '/admin/posts' : '/admin/pages';

  const load = useCallback(() => {
    const qs = new URLSearchParams({ type, page: String(page), perPage: '15' });
    if (status) qs.set('status', status);
    if (search) qs.set('search', search);
    api<Paginated<Content>>(`/content?${qs}`).then(setData).catch(() => {});
  }, [type, page, status, search]);

  useEffect(load, [load]);

  async function remove(id: string) {
    if (!confirm('Delete this item permanently?')) return;
    await api(`/content/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{label}</h1>
        <Link href={`${base}/new`}>
          <Button>New {type === 'POST' ? 'post' : 'page'}</Button>
        </Link>
      </div>
      <div className="mb-4 flex gap-3">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="max-w-[160px]"
        >
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="TRASHED">Trashed</option>
        </Select>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data?.items.map((item) => (
              <tr key={item.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link
                    href={`${base}/${item.id}`}
                    className="font-medium text-zinc-900 hover:text-indigo-600"
                  >
                    {item.title}
                  </Link>
                  <div className="text-xs text-zinc-400">/{item.slug}</div>
                </td>
                <td className="px-4 py-3 text-zinc-600">{item.author?.name}</td>
                <td className="px-4 py-3">
                  <Badge color={statusBadgeColor(item.status)}>{item.status}</Badge>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(item.updatedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3 text-xs">
                    {item.status === 'PUBLISHED' ? (
                      <a
                        href={`/${item.slug}`}
                        target="_blank"
                        className="text-zinc-500 hover:text-indigo-600"
                      >
                        View
                      </a>
                    ) : null}
                    <button
                      onClick={() => remove(item.id)}
                      className="text-zinc-500 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Nothing here yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {data && data.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-zinc-500">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
