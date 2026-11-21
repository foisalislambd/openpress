import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

export const ACCESS_COOKIE = 'op_access';
export const REFRESH_COOKIE = 'op_refresh';
export const CSRF_COOKIE = 'op_csrf';
export const SESSION_COOKIE = 'op_session';

export function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function wantsCookieSession(req: Request) {
  return req.get('x-openpress-client') === 'web';
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function writeSessionCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  const csrf = randomBytes(32).toString('base64url');
  const sameSite = cookieSameSite();
  const secure = sameSite === 'None' || cookieSecure();
  const locked = cookieAttrs(true, sameSite, secure);
  const readable = cookieAttrs(false, sameSite, secure);
  res.append('Set-Cookie', `${ACCESS_COOKIE}=${encodeURIComponent(tokens.accessToken)}; Max-Age=${15 * 60}; ${locked}`);
  res.append('Set-Cookie', `${REFRESH_COOKIE}=${encodeURIComponent(tokens.refreshToken)}; Max-Age=${7 * 24 * 60 * 60}; ${locked}`);
  res.append('Set-Cookie', `${CSRF_COOKIE}=${encodeURIComponent(csrf)}; Max-Age=${7 * 24 * 60 * 60}; ${readable}`);
  res.append('Set-Cookie', `${SESSION_COOKIE}=1; Max-Age=${7 * 24 * 60 * 60}; ${readable}`);
  return csrf;
}

export function clearSessionCookies(res: Response) {
  const sameSite = cookieSameSite();
  const secure = sameSite === 'None' || cookieSecure();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    res.append('Set-Cookie', `${name}=; Max-Age=0; ${cookieAttrs(true, sameSite, secure)}`);
  }
  for (const name of [CSRF_COOKIE, SESSION_COOKIE]) {
    res.append('Set-Cookie', `${name}=; Max-Age=0; ${cookieAttrs(false, sameSite, secure)}`);
  }
}

export function ensureCsrfCookie(req: Request, res: Response) {
  const existing = readCookie(req, CSRF_COOKIE);
  if (existing && existing.length >= 16) return existing;
  const csrf = randomBytes(32).toString('base64url');
  const sameSite = cookieSameSite();
  res.append(
    'Set-Cookie',
    `${CSRF_COOKIE}=${encodeURIComponent(csrf)}; Max-Age=${7 * 24 * 60 * 60}; ${cookieAttrs(false, sameSite, sameSite === 'None' || cookieSecure())}`,
  );
  return csrf;
}

function cookieAttrs(httpOnly: boolean, sameSite: 'Lax' | 'None', secure: boolean) {
  return `Path=/; SameSite=${sameSite}${httpOnly ? '; HttpOnly' : ''}${secure ? '; Secure' : ''}`;
}

function cookieSecure() {
  const origin = process.env.WEB_ORIGIN ?? '';
  const api = process.env.API_PUBLIC_URL ?? '';
  return origin.startsWith('https://') || api.startsWith('https://');
}

function cookieSameSite(): 'Lax' | 'None' {
  try {
    const web = new URL(process.env.WEB_ORIGIN || 'http://localhost:3000');
    const api = new URL(process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`);
    if (registrable(web.hostname) !== registrable(api.hostname)) return 'None';
  } catch {
    return 'Lax';
  }
  return 'Lax';
}

function registrable(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || isIp(host)) return host;
  const parts = host.split('.');
  return parts.slice(-2).join('.');
}

function isIp(host: string) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
}
