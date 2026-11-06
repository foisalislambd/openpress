/** Same window WordPress uses for post locks: two and a half minutes. */
export const LOCK_MS = 150_000;

export function lockUntil(now: Date) {
  return new Date(now.getTime() + LOCK_MS);
}

export function lockIsHeld(lock: { userId: string; expiresAt: Date } | null, userId: string, now: Date) {
  if (!lock) return false;
  if (lock.userId === userId) return false;
  return lock.expiresAt.getTime() > now.getTime();
}
