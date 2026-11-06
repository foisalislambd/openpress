import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { signWebhookBody } from '../cms/publishing';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { HooksService } from '../hooks/hooks.service';

const EVENTS = ['content.published', 'content.created', 'comment.created'];

@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private db: DbService,
    private hooks: HooksService,
  ) {}

  onModuleInit() {
    for (const event of EVENTS) {
      this.hooks.addAction(event, (payload: unknown) => this.dispatch(event, payload));
    }
  }

  list() {
    return this.db.query(
      `SELECT id, name, url, events, active, "createdAt" FROM webhooks ORDER BY "createdAt" DESC`,
    );
  }

  async create(input: { name: string; url: string; events?: string[] }) {
    const events = (input.events?.length ? input.events : ['content.published']).filter((event) =>
      EVENTS.includes(event),
    );
    const secret = newId() + newId();
    const row = await this.db.one(
      `INSERT INTO webhooks (id, name, url, secret, events)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, name, url, events, active, "createdAt"`,
      [newId(), input.name.trim(), input.url.trim(), secret, JSON.stringify(events)],
    );
    return { ...row, secret };
  }

  async remove(id: string) {
    const row = await this.db.one('DELETE FROM webhooks WHERE id = $1 RETURNING id', [id]);
    return row ?? { id };
  }

  async dispatch(event: string, payload: unknown) {
    const hooks = await this.db.query<{ id: string; url: string; secret: string }>(
      `SELECT id, url, secret FROM webhooks
       WHERE active = true AND events ? $1`,
      [event],
    );
    const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
    await Promise.all(
      hooks.map(async (hook) => {
        const signature = signWebhookBody(hook.secret, body);
        let status = 0;
        let error: string | null = null;
        try {
          const response = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-openpress-event': event,
              'x-openpress-signature': `sha256=${signature}`,
            },
            body,
            signal: AbortSignal.timeout(8000),
          });
          status = response.status;
          if (!response.ok) error = `HTTP ${response.status}`;
        } catch (err) {
          error = err instanceof Error ? err.message : 'delivery failed';
          this.logger.warn(`Webhook ${hook.id} failed: ${error}`);
        }
        await this.db.query(
          `INSERT INTO webhook_deliveries (id, "webhookId", event, status, error)
           VALUES ($1, $2, $3, $4, $5)`,
          [newId(), hook.id, event, status || null, error],
        );
      }),
    );
  }
}
