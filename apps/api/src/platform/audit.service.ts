import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DbService } from '../db/db.service';

@Injectable()
export class AuditService {
  constructor(private db: DbService) {}

  async record(action: string, detail: Record<string, unknown>, actorId?: string | null) {
    await this.db.query(
      `INSERT INTO audit_log (id, "actorId", action, detail) VALUES ($1, $2, $3, $4::jsonb)`,
      [randomUUID(), actorId ?? null, action.slice(0, 80), JSON.stringify(detail)],
    );
  }

  list() {
    return this.db.query(
      `SELECT id, "actorId", action, detail, "createdAt" FROM audit_log ORDER BY "createdAt" DESC LIMIT 100`,
    );
  }
}
