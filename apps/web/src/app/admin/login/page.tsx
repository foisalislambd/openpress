'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, setTokens } from '@/lib/client-api';
import { Button, Card, Input, Label } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api<{ accessToken: string; refreshToken: string }>(
        mode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'login' ? { email, password } : { email, password, name },
          ),
        },
      );
      setTokens(data.accessToken, data.refreshToken);
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-extrabold tracking-tight">
          Open<span className="text-indigo-600">Press</span>
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-500">
          {mode === 'login' ? 'Sign in to your dashboard' : 'Create your account'}
        </p>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' ? (
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </Button>
        </form>
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-4 w-full text-center text-sm text-indigo-600 hover:underline"
        >
          {mode === 'login'
            ? 'First time? Create the admin account'
            : 'Already have an account? Sign in'}
        </button>
      </Card>
    </div>
  );
}
