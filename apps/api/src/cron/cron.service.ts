import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { isUndefinedTable } from '../db/errors';
import { newId } from '../db/ids';
import { HooksService } from '../hooks/hooks.service';
import { CRON_HOOK, failureDelaySeconds, nextRun, skippedIntervals } from './cron-schedule';

const DEFAULTS: { hook: string; intervalSeconds: number }[] = [
  { hook: 'openpress.publish_due', intervalSeconds: 30 },
  { hook: 'openpress.purge_stale', intervalSeconds: 3600 },
  { hook: 'openpress.health_beat', intervalSeconds: 300 },
];

@Injectable()
export class CronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Cron');
  private timer?: NodeJS.Timeout;

  constructor(
    private db: DbService,
    private hooks: HooksService,
  ) {}

  onModuleInit() {
    this.hooks.addAction('openpress.health_beat', () => this.beat());
    void this.ensureDefaults().catch((error) => this.logger.warn(String(error)));
    this.timer = setInterval(() => {
      void this.tick().catch((error) => this.logger.error(String(error)));
    }, 15_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list() {
    return this.db.query(
      `SELECT id, hook, args, "nextRunAt", "intervalSeconds", attempts, "lastError", "createdAt"
       FROM cron_events ORDER BY "nextRunAt" ASC`,
    );
  }

  async schedule(input: { hook: string; args?: unknown[]; runAt?: string; intervalSeconds?: number | null }) {
    const hook = input.hook.trim();
    if (!CRON_HOOK.test(hook)) throw new BadRequestException('Invalid cron hook');
    const interval = input.intervalSeconds == null ? null : Math.floor(input.intervalSeconds);
    if (interval !== null && (interval < 15 || interval > 366 * 24 * 3600)) {
      throw new BadRequestException('Recurring events need between 15 seconds and one year');
    }
    const args = Array.isArray(input.args) ? input.args.slice(0, 8) : [];
    const when = input.runAt ? new Date(input.runAt) : new Date();
    if (Number.isNaN(when.getTime())) throw new BadRequestException('Invalid runAt');
    if (when.getTime() > Date.now() + 10 * 366 * 24 * 3600 * 1000) {
      throw new BadRequestException('That run date is too far in the future');
    }
    if (interval) {
      const existing = await this.db.query<{ id: string; args: unknown; nextRunAt: Date }>(
        'SELECT id, args, "nextRunAt" FROM cron_events WHERE hook = $1 AND "intervalSeconds" = $2',
        [hook, interval],
      );
      const match = existing.find((row) => JSON.stringify(row.args ?? []) === JSON.stringify(args));
      if (match) return { id: match.id, hook, nextRunAt: new Date(match.nextRunAt).toISOString(), intervalSeconds: interval, duplicate: true };
    }
    const id = newId();
    await this.db.query(
      `INSERT INTO cron_events (id, hook, args, "nextRunAt", "intervalSeconds")
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [id, hook, JSON.stringify(args), when.toISOString(), interval],
    );
    return { id, hook, nextRunAt: when.toISOString(), intervalSeconds: interval };
  }

  async unschedule(id: string) {
    const removed = await this.db.one('DELETE FROM cron_events WHERE id = $1 RETURNING id', [id]);
    if (!removed) throw new NotFoundException('Scheduled event not found');
    return removed;
  }

  async tick(now = new Date()) {
    let due: {
      id: string;
      hook: string;
      args: unknown[];
      intervalSeconds: number | null;
      attempts: number;
    }[] = [];
    try {
      due = await this.db.query(
        `WITH claimed AS (
           SELECT id FROM cron_events
           WHERE "nextRunAt" <= $1
             AND ("lockedUntil" IS NULL OR "lockedUntil" <= $1)
           ORDER BY "nextRunAt" ASC
           LIMIT 20
           FOR UPDATE SKIP LOCKED
         )
         UPDATE cron_events AS event
         SET "lockedUntil" = $1::timestamptz + interval '2 minutes'
         FROM claimed
         WHERE event.id = claimed.id
         RETURNING event.id, event.hook, event.args, event."intervalSeconds", event.attempts`,
        [now.toISOString()],
      );
    } catch (error) {
      if (isUndefinedTable(error)) return { ran: 0 };
      throw error;
    }
    let ran = 0;
    for (const event of due) {
      try {
        const args = Array.isArray(event.args) ? event.args : [];
        await this.hooks.doAction(event.hook, ...args);
        if (event.intervalSeconds) {
          const row = await this.db.one<{ nextRunAt: Date }>('SELECT "nextRunAt" FROM cron_events WHERE id = $1', [event.id]);
          const skipped = row ? skippedIntervals(new Date(row.nextRunAt), event.intervalSeconds, now) : 0;
          if (skipped > 0) this.logger.warn(`${event.hook} skipped ${skipped} interval(s); scheduling the next one only`);
          await this.db.query(
            `UPDATE cron_events
             SET "nextRunAt" = $2, "lockedUntil" = NULL, attempts = 0, "lastError" = NULL
             WHERE id = $1`,
            [event.id, nextRun(now, event.intervalSeconds).toISOString()],
          );
        } else {
          await this.db.query('DELETE FROM cron_events WHERE id = $1', [event.id]);
        }
        ran += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const attempts = event.attempts + 1;
        if (!event.intervalSeconds && attempts >= 5) {
          await this.db.query('DELETE FROM cron_events WHERE id = $1', [event.id]);
          this.logger.error(`Dropping cron ${event.hook} after ${attempts} failures: ${message}`);
          continue;
        }
        const delay = failureDelaySeconds(attempts, event.intervalSeconds);
        await this.db.query(
          `UPDATE cron_events
           SET "nextRunAt" = $2, "lockedUntil" = NULL, attempts = $3, "lastError" = $4
           WHERE id = $1`,
          [event.id, new Date(now.getTime() + delay * 1000).toISOString(), attempts, message.slice(0, 500)],
        );
      }
    }
    return { ran };
  }

  private async ensureDefaults() {
    for (const event of DEFAULTS) {
      const existing = await this.db.one('SELECT id FROM cron_events WHERE hook = $1 AND "intervalSeconds" IS NOT NULL', [
        event.hook,
      ]);
      if (existing) continue;
      await this.schedule({ hook: event.hook, intervalSeconds: event.intervalSeconds });
    }
  }

  private async beat() {
    await this.db.query(
      `INSERT INTO settings (key, value, autoload, "updatedAt")
       VALUES ('cronHeartbeat', $1::jsonb, false, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, autoload = false, "updatedAt" = now()`,
      [JSON.stringify(new Date().toISOString())],
    );
  }
}
