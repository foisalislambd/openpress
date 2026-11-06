/** Pure scheduling rules for Postgres-backed cron. Redis is not required. */

/** How many intervals were missed while the process was down. The next run is still one interval ahead, not a replay. */
export function skippedIntervals(nextRunAt: Date, intervalSeconds: number, now: Date) {
  const interval = Math.max(15, Math.floor(intervalSeconds));
  const late = now.getTime() - nextRunAt.getTime();
  if (late <= interval * 1000) return 0;
  return Math.floor(late / (interval * 1000));
}

export function nextRun(from: Date, intervalSeconds: number) {
  const interval = Math.max(15, Math.floor(intervalSeconds));
  return new Date(from.getTime() + interval * 1000);
}

export function isDue(row: { nextRunAt: Date | string; lockedUntil?: Date | string | null }, now: Date) {
  const nextAt = new Date(row.nextRunAt).getTime();
  if (Number.isNaN(nextAt) || nextAt > now.getTime()) return false;
  if (!row.lockedUntil) return true;
  const locked = new Date(row.lockedUntil).getTime();
  return Number.isNaN(locked) || locked <= now.getTime();
}

export function failureDelaySeconds(attempts: number, intervalSeconds: number | null) {
  const backoff = Math.min(3600, 30 * 2 ** Math.max(0, attempts));
  if (!intervalSeconds) return backoff;
  return Math.min(intervalSeconds, backoff);
}

export const CRON_HOOK = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,80}$/;
