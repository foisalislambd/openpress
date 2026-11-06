'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { OpenPressMark } from '@/components/brand/openpress-mark';
import { api, setTokens } from '@/lib/client-api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');
  const [providers, setProviders] = useState<{ google?: boolean; github?: boolean }>({});

  useEffect(() => {
    api<{ google?: boolean; github?: boolean }>('/auth/oauth/providers').then(setProviders).catch(() => {});
    const oauth = new URLSearchParams(window.location.search).get('oauth');
    if (!oauth) return;
    api<{ accessToken: string; refreshToken: string }>('/auth/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code: oauth }),
    })
      .then((data) => {
        setTokens(data.accessToken, data.refreshToken);
        router.replace('/admin');
      })
      .catch(() => setError('The sign-in link expired. Try again.'));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (ticket) {
        const data = await api<{ accessToken: string; refreshToken: string }>('/auth/mfa', {
          method: 'POST',
          body: JSON.stringify({ ticket, code }),
        });
        setTokens(data.accessToken, data.refreshToken);
        router.replace('/admin');
        return;
      }
      const data = await api<{ accessToken?: string; refreshToken?: string; mfaRequired?: boolean; ticket?: string }>(
        mode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'login' ? { email, password } : { email, password, name },
          ),
        },
      );
      if (data.mfaRequired && data.ticket) {
        setTicket(data.ticket);
        return;
      }
      if (!data.accessToken || !data.refreshToken) throw new Error('Sign-in did not return a session');
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
        <Link className="op-login-logo" href="/">
          <OpenPressMark size={84} />
          <span>OpenPress</span>
        </Link>
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
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!ticket} />
          {ticket ? (
            <>
              <label htmlFor="code">Authenticator code</label>
              <input id="code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required />
            </>
          ) : null}
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
              {loading ? 'Please wait…' : ticket ? 'Verify' : mode === 'login' ? 'Log In' : 'Register'}
            </button>
          </p>
        </form>
        <p className="op-login-nav">
          {providers.google ? (
            <button type="button" onClick={async () => {
              const start = await api<{ url: string }>('/auth/oauth/google/start');
              window.location.href = start.url;
            }}>Google</button>
          ) : null}
          {providers.github ? (
            <button type="button" onClick={async () => {
              const start = await api<{ url: string }>('/auth/oauth/github/start');
              window.location.href = start.url;
            }}>GitHub</button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              const options = await api<Record<string, unknown>>('/auth/passkeys/login/options', {
                method: 'POST',
                body: JSON.stringify({ email: email || undefined }),
              });
              const response = await startAuthentication({ optionsJSON: options as never });
              const data = await api<{ accessToken: string; refreshToken: string }>('/auth/passkeys/login/verify', {
                method: 'POST',
                body: JSON.stringify({ response }),
              });
              setTokens(data.accessToken, data.refreshToken);
              router.replace('/admin');
            }}
          >
            Use a passkey
          </button>
        </p>
        <p className="op-login-nav">
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Log in'}
          </button>
          {' | '}
          <Link href="/">← Go to OpenPress</Link>
        </p>
      </div>
    </div>
  );
}
