import type { Request } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE, readCookie } from './session-cookie';

/** Browser logins and cookie sessions must present the double-submit token. Bearer clients do not. */
export function requiresCsrf(req: Pick<Request, 'method' | 'headers'> & { header?: Request['header'] }) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const authorization = headerValue(req, 'authorization');
  if (authorization?.startsWith('Bearer ')) return false;
  if (readCookie(req as Request, ACCESS_COOKIE) || readCookie(req as Request, REFRESH_COOKIE)) return true;
  return headerValue(req, 'x-openpress-client') === 'web';
}

function headerValue(req: { headers: Request['headers']; header?: Request['header'] }, name: string) {
  const fromHeaders = req.headers[name];
  const value = Array.isArray(fromHeaders) ? fromHeaders[0] : fromHeaders;
  if (typeof value === 'string') return value;
  return req.header?.(name) ?? undefined;
}
