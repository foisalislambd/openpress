import { createHash, randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { normalizeScopes } from '../cms/publishing';

@Injectable()
export class ApiKeyService {
  constructor(private db: DbService) {}

  list(userId: string) {
    return this.db.query(
      `SELECT id, name, prefix, scopes, "lastUsedAt", "createdAt"
       FROM api_keys WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
      [userId],
    );
  }

  async create(userId: string, name: string, scopes: unknown) {
    const secret = randomBytes(24).toString('base64url');
    const token = `opk_${secret}`;
    const prefix = token.slice(0, 12);
    const keyHash = createHash('sha256').update(token).digest('hex');
    const saved = normalizeScopes(scopes);
    const row = await this.db.one(
      `INSERT INTO api_keys (id, "userId", name, prefix, "keyHash", scopes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, name, prefix, scopes, "createdAt"`,
      [newId(), userId, name.trim(), prefix, keyHash, JSON.stringify(saved.length ? saved : ['content:read'])],
    );
    return { ...row, token };
  }

  async remove(userId: string, id: string) {
    const row = await this.db.one(
      'DELETE FROM api_keys WHERE id = $1 AND "userId" = $2 RETURNING id',
      [id, userId],
    );
    if (!row) throw new NotFoundException('API key not found');
    return row;
  }

  async authenticate(header: string) {
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token.startsWith('opk_')) return null;
    const prefix = token.slice(0, 12);
    const keyHash = createHash('sha256').update(token).digest('hex');
    const row = await this.db.one<{
      id: string;
      userId: string;
      scopes: string[];
      email: string;
      role: string;
    }>(
      `SELECT k.id, k."userId", k.scopes, u.email, u.role
       FROM api_keys k
       JOIN users u ON u.id = k."userId"
       WHERE k.prefix = $1 AND k."keyHash" = $2`,
      [prefix, keyHash],
    );
    if (!row) return null;
    await this.db.query('UPDATE api_keys SET "lastUsedAt" = now() WHERE id = $1', [row.id]);
    return {
      sub: row.userId,
      email: row.email,
      role: row.role,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
    };
  }
}
