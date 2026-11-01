'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function PasswordGate({
  slug,
  title,
  excerpt,
}: {
  slug: string;
  title: string;
  excerpt?: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/content/public/slug/${encodeURIComponent(slug)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.message === 'string' ? body.message : 'Incorrect password');
        return;
      }
      document.cookie = `op_unlock_${slug}=${encodeURIComponent(body.token)}; Path=/; Max-Age=3600; SameSite=Lax`;
      router.refresh();
    } catch {
      setError('Could not unlock this post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="mx-auto max-w-lg">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {excerpt ? <p className="mt-3 text-zinc-600">{excerpt}</p> : null}
      <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-zinc-200 p-4">
        <p className="text-sm">This content is password protected.</p>
        <label className="block text-sm font-medium" htmlFor="post-password">
          Password
        </label>
        <input
          id="post-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </article>
  );
}
