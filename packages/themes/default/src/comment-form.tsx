'use client';

import React, { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function CommentForm({ contentId, closed }: { contentId: string; closed?: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(window.localStorage.getItem('op_token')));
  }, []);

  if (closed) {
    return <p className="text-sm text-zinc-500">Comments are closed.</p>;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const token = window.localStorage.getItem('op_token');
      const res = await fetch(`${API_URL}/api/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          contentId,
          guestName: token ? undefined : name,
          guestEmail: token ? undefined : email || undefined,
          body,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof payload.message === 'string' ? payload.message : 'Could not post that comment');
        return;
      }
      setBody('');
      setMessage(
        payload.status === 'APPROVED'
          ? 'Comment posted.'
          : payload.status === 'SPAM'
            ? 'That comment was held as spam.'
            : 'Comment submitted and waiting for moderation.',
      );
    } catch {
      setError('Could not post that comment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <h3 className="text-sm font-semibold">Leave a comment</h3>
      {signedIn ? (
        <p className="text-sm text-zinc-500">Posting as the account signed in to this browser.</p>
      ) : (
        <>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            aria-label="Email"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </>
      )}
      <textarea
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Comment"
        aria-label="Comment"
        rows={4}
        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? 'Posting…' : 'Post comment'}
      </button>
    </form>
  );
}
