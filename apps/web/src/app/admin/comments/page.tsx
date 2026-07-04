'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Comment } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Badge, Button, Select, statusBadgeColor } from '@/components/ui';

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    api<Comment[]>(`/comments${filter ? `?status=${filter}` : ''}`)
      .then(setComments)
      .catch(() => {});
  }, [filter]);

  useEffect(load, [load]);

  async function setStatus(id: string, status: string) {
    await api(`/comments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this comment permanently?')) return;
    await api(`/comments/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Comments</h1>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-[180px]"
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="SPAM">Spam</option>
          <option value="TRASHED">Trashed</option>
        </Select>
      </div>
      <div className="space-y-4">
        {comments.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm">
                <span className="font-semibold">
                  {c.author?.name ?? c.guestName ?? 'Anonymous'}
                </span>
                <span className="ml-2 text-zinc-400">
                  on{' '}
                  <a
                    href={`/${c.content?.slug}`}
                    target="_blank"
                    className="text-indigo-600 hover:underline"
                  >
                    {c.content?.title}
                  </a>
                </span>
              </div>
              <Badge color={statusBadgeColor(c.status)}>{c.status}</Badge>
            </div>
            <p className="mb-3 text-sm text-zinc-700">{c.body}</p>
            <div className="flex gap-2">
              {c.status !== 'APPROVED' ? (
                <Button variant="secondary" onClick={() => setStatus(c.id, 'APPROVED')}>
                  Approve
                </Button>
              ) : null}
              {c.status !== 'SPAM' ? (
                <Button variant="ghost" onClick={() => setStatus(c.id, 'SPAM')}>
                  Spam
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => remove(c.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
        {comments.length === 0 ? (
          <p className="py-10 text-center text-zinc-500">No comments found.</p>
        ) : null}
      </div>
    </div>
  );
}
