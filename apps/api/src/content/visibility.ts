import { createHmac, timingSafeEqual } from 'crypto';

export type Visibility = 'PUBLIC' | 'PRIVATE' | 'PASSWORD';

export function redactPasswordContent<T extends { visibility: string; blocks: unknown[] }>(
  content: T,
  unlocked: boolean,
): T & { passwordRequired: boolean } {
  if (content.visibility !== 'PASSWORD' || unlocked) {
    return { ...content, passwordRequired: false };
  }
  return { ...content, blocks: [], passwordRequired: true };
}

export function signUnlock(secret: string, slug: string, now = Date.now(), ttlMs = 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({ slug, exp: now + ttlMs })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyUnlock(secret: string, token: string | undefined, slug: string, now = Date.now()) {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      slug?: string;
      exp?: number;
    };
    return data.slug === slug && typeof data.exp === 'number' && data.exp > now;
  } catch {
    return false;
  }
}

export function isDueForPublish(status: string, scheduledAt: Date | string | null, now: Date) {
  if (status !== 'SCHEDULED' || !scheduledAt) return false;
  const when = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  return !Number.isNaN(when.getTime()) && when.getTime() <= now.getTime();
}
