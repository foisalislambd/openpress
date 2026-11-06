import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CapabilitiesService } from '../auth/capabilities.service';

@Injectable()
export class NetworkService {
  constructor(
    private db: DbService,
    private caps: CapabilitiesService,
  ) {}

  async settings() {
    const rows = await this.db.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
      [['networkTitle', 'allowNewSites']],
    );
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      networkTitle: typeof map.networkTitle === 'string' ? map.networkTitle : 'OpenPress Network',
      allowNewSites: map.allowNewSites !== false,
    };
  }

  async saveSettings(input: { networkTitle?: string; allowNewSites?: boolean }) {
    if (input.networkTitle !== undefined) {
      const title = input.networkTitle.trim().slice(0, 120);
      if (!title) throw new BadRequestException('Network title is required');
      await this.write('networkTitle', title);
    }
    if (input.allowNewSites !== undefined) await this.write('allowNewSites', input.allowNewSites);
    return this.settings();
  }

  async users() {
    const people = await this.db.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      networkAdmin: boolean;
    }>(
      `SELECT id, email, name, role, "networkAdmin" FROM users ORDER BY "createdAt" ASC`,
    );
    const memberships = await this.db.query<{ userId: string; siteId: string; slug: string; name: string; role: string }>(
      `SELECT su."userId", su."siteId", s.slug, s.name, su.role
       FROM site_users su JOIN sites s ON s.id = su."siteId"
       ORDER BY s.name ASC`,
    );
    return people.map((person) => ({
      ...person,
      sites: memberships
        .filter((row) => row.userId === person.id)
        .map((row) => ({ siteId: row.siteId, slug: row.slug, name: row.name, role: row.role })),
    }));
  }

  async updateUser(actorId: string, id: string, input: { networkAdmin?: boolean; memberships?: { siteId: string; role: string | null }[] }) {
    const user = await this.db.one<{ id: string; networkAdmin: boolean }>('SELECT id, "networkAdmin" FROM users WHERE id = $1', [id]);
    if (!user) throw new NotFoundException('User not found');
    if (input.networkAdmin === false && user.networkAdmin) {
      const admins = await this.db.one<{ count: number }>(
        'SELECT count(*)::int AS count FROM users WHERE "networkAdmin" = true',
      );
      if ((admins?.count ?? 0) <= 1) throw new BadRequestException('Cannot remove the last network administrator');
    }
    if (input.networkAdmin !== undefined) {
      await this.db.query('UPDATE users SET "networkAdmin" = $2, "updatedAt" = now() WHERE id = $1', [id, input.networkAdmin]);
    }
    for (const membership of input.memberships ?? []) {
      if (membership.role === null || membership.role === '') {
        await this.db.query('DELETE FROM site_users WHERE "siteId" = $1 AND "userId" = $2', [membership.siteId, id]);
        continue;
      }
      await this.caps.assertAssignable(actorId, membership.role);
      await this.db.query(
        `INSERT INTO site_users ("siteId", "userId", role) VALUES ($1, $2, $3)
         ON CONFLICT ("siteId", "userId") DO UPDATE SET role = EXCLUDED.role`,
        [membership.siteId, id, membership.role],
      );
    }
    const [next] = (await this.users()).filter((person) => person.id === id);
    return next;
  }

  private async write(key: string, value: unknown) {
    await this.db.query(
      `INSERT INTO settings (key, value, autoload, "updatedAt") VALUES ($1, $2::jsonb, true, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [key, JSON.stringify(value)],
    );
  }
}
