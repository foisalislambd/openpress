'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Comment } from '@openpress/shared';
import { api } from '@/lib/client-api';
import { Button, Select } from '@/components/ui';
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
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState('APPROVED');

  const load = useCallback(() => {
    api<Comment[]>('/comments')
      .then((rows) => {
        setComments(rows);
        setSelected([]);
      })
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const visible = comments.filter((comment) => !filter || comment.status === filter);

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

  async function applyBulk() {
    if (selected.length === 0) return;
    if (bulk === 'DELETE' && !confirm(`Delete ${selected.length} comment(s) permanently?`)) return;
    await Promise.all(
      selected.map((id) =>
        bulk === 'DELETE'
          ? api(`/comments/${id}`, { method: 'DELETE' })
          : api(`/comments/${id}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: bulk }),
            }),
      ),
    );
    load();
  }

  return (
    <Screen
      title="Comments"
      help="Approve comments before they show on the site. Spam and trash stay out of the public list."
    >
      <ul className="op-subsubsub">
        {FILTERS.map((item) => {
          const count = item.value
            ? comments.filter((comment) => comment.status === item.value).length
            : comments.length;
          return (
            <li key={item.value || 'all'}>
              <button
                type="button"
                className={filter === item.value ? 'is-current' : undefined}
                onClick={() => setFilter(item.value)}
              >
                {item.label} <span className="op-status">({count})</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="op-tablenav">
        <div className="op-bulk">
          <Select value={bulk} onChange={(e) => setBulk(e.target.value)}>
            <option value="APPROVED">Approve</option>
            <option value="PENDING">Unapprove</option>
            <option value="SPAM">Mark as spam</option>
            <option value="TRASHED">Move to Trash</option>
            <option value="DELETE">Delete permanently</option>
          </Select>
          <Button type="button" variant="secondary" disabled={selected.length === 0} onClick={applyBulk}>
            Apply
          </Button>
        </div>
      </div>
      <table className="op-list">
        <thead>
          <tr>
            <th className="op-cb">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={visible.length > 0 && visible.every((comment) => selected.includes(comment.id))}
                onChange={(e) => setSelected(e.target.checked ? visible.map((comment) => comment.id) : [])}
              />
            </th>
            <th>Author</th>
            <th>Comment</th>
            <th>In response to</th>
            <th>Submitted on</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((comment) => {
            const name = comment.author?.name ?? comment.guestName ?? 'Anonymous';
            return (
              <tr key={comment.id}>
                <td className="op-cb">
                  <input
                    type="checkbox"
                    aria-label={`Select comment by ${name}`}
                    checked={selected.includes(comment.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, comment.id]
                          : selected.filter((id) => id !== comment.id),
                      )
                    }
                  />
                </td>
                <td>
                  <strong>{name}</strong>
                  <div className="op-description">{comment.status.toLowerCase()}</div>
                </td>
                <td>
                  {comment.body}
                  <div className="op-row-actions">
                    {comment.status === 'APPROVED' ? (
                      <button type="button" onClick={() => setStatus(comment.id, 'PENDING')}>
                        Unapprove
                      </button>
                    ) : (
                      <button type="button" onClick={() => setStatus(comment.id, 'APPROVED')}>
                        Approve
                      </button>
                    )}
                    {' | '}
                    {comment.status !== 'SPAM' ? (
                      <>
                        <button type="button" onClick={() => setStatus(comment.id, 'SPAM')}>
                          Spam
                        </button>
                        {' | '}
                      </>
                    ) : null}
                    {comment.status !== 'TRASHED' ? (
                      <>
                        <button type="button" onClick={() => setStatus(comment.id, 'TRASHED')}>
                          Trash
                        </button>
                        {' | '}
                      </>
                    ) : null}
                    <button type="button" className="is-delete" onClick={() => remove(comment.id)}>
                      Delete permanently
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
            );
          })}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={5}>No comments found.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Screen>
  );
}
