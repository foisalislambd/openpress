import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { JwtPayload } from './jwt.strategy';

const PREFIX_LEN = 8;

@Injectable()
export class AppPasswordService {
  constructor(private db: DbService) {}

  async list(userId: string) {
    return this.db.query(
      `SELECT id, name, "lastUsedAt", "createdAt"
       FROM application_passwords
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC`,
      [userId],
    );
  }

  async create(userId: string, name: string) {
    const password = randomBytes(18).toString('base64url');
    const prefix = password.slice(0, PREFIX_LEN);
    const row = await this.db.one<{ id: string; name: string; createdAt: Date }>(
      `INSERT INTO application_passwords (id, "userId", name, prefix, "passwordHash")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, "createdAt"`,
      [newId(), userId, name.trim(), prefix, await bcrypt.hash(password, 10)],
    );
    return { ...row, password };
  }

  async remove(userId: string, id: string) {
    const row = await this.db.one<{ id: string }>(
      'DELETE FROM application_passwords WHERE id = $1 AND "userId" = $2 RETURNING id',
      [id, userId],
    );
    if (!row) throw new NotFoundException('Application password not found');
    return row;
  }

  async authenticate(header: string): Promise<JwtPayload | null> {
    const encoded = header.slice('Basic '.length).trim();
    let decoded: string;
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return null;
    }
    const split = decoded.indexOf(':');
    if (split <= 0) return null;
    const email = decoded.slice(0, split);
    const password = decoded.slice(split + 1);
    if (!email || password.length < PREFIX_LEN) return null;
    const user = await this.db.one<{ id: string; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE email = $1',
      [email],
    );
    if (!user) return null;
    const rows = await this.db.query<{ id: string; passwordHash: string }>(
      `SELECT id, "passwordHash" FROM application_passwords
       WHERE "userId" = $1 AND prefix = $2`,
      [user.id, password.slice(0, PREFIX_LEN)],
    );
    for (const row of rows) {
      if (await bcrypt.compare(password, row.passwordHash)) {
        await this.db.query(
          'UPDATE application_passwords SET "lastUsedAt" = now() WHERE id = $1',
          [row.id],
        );
        return { sub: user.id, email: user.email, role: user.role };
      }
    }
    return null;
  }
}
