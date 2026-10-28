'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, setTokens } from '@/lib/client-api';

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
    <div className="op-login">
      <div className="op-login-box">
        <a className="op-login-logo" href="/" style={{ fontSize: 20, lineHeight: '84px' }}>
          OpenPress
        </a>
        <form onSubmit={submit}>
          {mode === 'register' ? (
            <>
              <label htmlFor="name">Name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </>
          ) : null}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error ? <p style={{ color: '#d63638' }}>{error}</p> : null}
          <p className="op-login-submit">
            <button
              type="submit"
              disabled={loading}
              style={{
                float: 'right',
                minHeight: 32,
                padding: '0 12px',
                border: '1px solid #3858e9',
                borderRadius: 3,
                background: '#3858e9',
                color: '#fff',
                fontSize: 13,
              }}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Register'}
            </button>
          </p>
        </form>
        <p className="op-login-nav">
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Log in'}
          </button>
          {' | '}
          <a href="/">← Go to OpenPress</a>
        </p>
      </div>
    </div>
  );
}
