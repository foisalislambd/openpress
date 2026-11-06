import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { currentSiteId } from './site-context';

const KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

@Injectable()
export class TransientsService {
  constructor(private db: DbService) {}

  async get(key: string, scope: 'site' | 'network' = 'site') {
    const safe = cleanKey(key);
    const row = await this.db.one<{ value: unknown; expiresAt: Date | null }>(
      `SELECT value, "expiresAt" FROM transients WHERE "siteId" = $1 AND key = $2`,
      [scopeId(scope), safe],
    );
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.delete(safe, scope);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: unknown, ttlSeconds?: number, scope: 'site' | 'network' = 'site') {
    const safe = cleanKey(key);
    const ttl = ttlSeconds === undefined ? null : Math.floor(ttlSeconds);
    if (ttl !== null && (!Number.isFinite(ttl) || ttl < 1 || ttl > 60 * 60 * 24 * 365)) {
      throw new BadRequestException('Transient TTL is out of range');
    }
    const expires = ttl === null ? null : new Date(Date.now() + ttl * 1000);
    await this.db.query(
      `INSERT INTO transients ("siteId", key, value, "expiresAt")
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT ("siteId", key) DO UPDATE SET value = EXCLUDED.value, "expiresAt" = EXCLUDED."expiresAt"`,
      [scopeId(scope), safe, JSON.stringify(value ?? null), expires],
    );
    return true;
  }

  async delete(key: string, scope: 'site' | 'network' = 'site') {
    await this.db.query('DELETE FROM transients WHERE "siteId" = $1 AND key = $2', [scopeId(scope), cleanKey(key)]);
    return true;
  }
}

export function cleanTransientKey(key: string) {
  return cleanKey(key);
}

function cleanKey(key: string) {
  if (!KEY.test(key)) throw new BadRequestException('Invalid transient key');
  return key;
}

function scopeId(scope: 'site' | 'network') {
  return scope === 'network' ? 'network' : currentSiteId();
}
