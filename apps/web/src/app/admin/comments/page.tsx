'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Comment } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Screen } from '@/components/admin/screen';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'TRASHED', label: 'Trash' },
];

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
    <Screen title="Comments">
      <ul className="op-subsubsub">
        {FILTERS.map((item) => (
          <li key={item.value || 'all'}>
            <button
              type="button"
              className={filter === item.value ? 'is-current' : undefined}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <table className="op-list mt-3">
        <thead>
          <tr>
            <th>Author</th>
            <th>Comment</th>
            <th>In response to</th>
            <th>Submitted on</th>
          </tr>
        </thead>
        <tbody>
          {comments.map((comment) => (
            <tr key={comment.id}>
              <td>
                <strong>{comment.author?.name ?? comment.guestName ?? 'Anonymous'}</strong>
                <div className="op-description">{comment.status}</div>
              </td>
              <td>
                {comment.body}
                <div className="op-row-actions">
                  {comment.status !== 'APPROVED' ? (
                    <>
                      <button type="button" onClick={() => setStatus(comment.id, 'APPROVED')}>
                        Approve
                      </button>
                      {' | '}
                    </>
                  ) : null}
                  {comment.status !== 'SPAM' ? (
                    <>
                      <button type="button" onClick={() => setStatus(comment.id, 'SPAM')}>
                        Spam
                      </button>
                      {' | '}
                    </>
                  ) : null}
                  <button type="button" className="is-delete" onClick={() => remove(comment.id)}>
                    Delete
                  </button>
                </div>
              </td>
              <td>
                <a href={`/${comment.content?.slug}`} target="_blank" rel="noreferrer">
                  {comment.content?.title}
                </a>
              </td>
              <td>
                {new Date(comment.createdAt).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </td>
            </tr>
          ))}
          {comments.length === 0 ? (
            <tr>
              <td colSpan={4}>No comments found.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Screen>
  );
}
