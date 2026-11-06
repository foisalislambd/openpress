import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { HooksService } from '../hooks/hooks.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger('Mail');

  constructor(
    private db: DbService,
    private hooks: HooksService,
    private settings: SettingsService,
  ) {}

  onModuleInit() {
    this.hooks.addAction('comment.created', (comment: unknown) => this.notifyComment(comment));
  }

  async send(to: string, subject: string, body: string) {
    const id = newId();
    await this.db.query(
      `INSERT INTO mail_queue (id, "toAddress", subject, body, status) VALUES ($1, $2, $3, $4, 'QUEUED')`,
      [id, to, subject, body],
    );
    const host = process.env.SMTP_HOST;
    if (!host || !to) {
      return { id, status: 'QUEUED' as const };
    }
    try {
      const transport = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASSWORD
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
            : undefined,
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || 'openpress@localhost',
        to,
        subject,
        text: body,
      });
      await this.db.query(`UPDATE mail_queue SET status = 'SENT' WHERE id = $1`, [id]);
      return { id, status: 'SENT' as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'send failed';
      this.logger.warn(message);
      await this.db.query(`UPDATE mail_queue SET status = 'FAILED' WHERE id = $1`, [id]);
      return { id, status: 'FAILED' as const };
    }
  }

  private async notifyComment(comment: unknown) {
    const row = comment as { contentId?: string; body?: string; status?: string };
    if (!row?.contentId) return;
    const settings = await this.settings.getAll();
    if (settings.commentNotify === false) return;
    const content = await this.db.one<{ title: string; email: string }>(
      `SELECT c.title, u.email
       FROM contents c
       JOIN users u ON u.id = c."authorId"
       WHERE c.id = $1`,
      [row.contentId],
    );
    const recipients = new Set<string>();
    if (content?.email) recipients.add(content.email);
    if (typeof settings.adminEmail === 'string' && settings.adminEmail.includes('@')) {
      recipients.add(settings.adminEmail);
    }
    const subject = `New comment on ${content?.title ?? 'a post'}`;
    const body = `Status: ${row.status ?? 'PENDING'}\n\n${row.body ?? ''}`;
    await Promise.all([...recipients].map((to) => this.send(to, subject, body)));
  }
}
