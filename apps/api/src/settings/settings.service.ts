import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DbService } from '../db/db.service';

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  siteTitle: 'OpenPress Site',
  siteDescription: 'A modern site powered by OpenPress',
  activeTheme: 'default',
  homepageType: 'latest-posts',
  homepageId: null,
  postsPerPage: 10,
  allowRegistration: false,
  adminEmail: '',
  timezone: 'UTC',
  dateFormat: 'F j, Y',
  timeFormat: 'g:i a',
  weekStartsOn: '1',
  siteLanguage: 'en',
  allowComments: true,
  commentModeration: true,
  commentRegistration: false,
  thumbnailSize: 150,
  mediumSize: 300,
  largeSize: 1024,
  permalinkStructure: '/%postname%/',
  privacyPageId: null,
  defaultCategoryId: null,
  defaultRole: 'AUTHOR',
  menus: [],
  widgets: { sidebar: [], footer: [] },
};

// Only these keys can be written via the public settings API. Internal keys
// (e.g. enabledPlugins) are managed by their own services and never exposed.
const PUBLIC_KEYS = Object.keys(DEFAULT_SETTINGS);

@Injectable()
export class SettingsService {
  constructor(
    private db: DbService,
    private events: EventEmitter2,
  ) {}

  async getAll() {
    const rows = await this.db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
      [PUBLIC_KEYS],
    );
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async updateMany(values: Record<string, unknown>) {
    const entries = Object.entries(values).filter(([key]) =>
      PUBLIC_KEYS.includes(key),
    );
    if (entries.length === 0) {
      throw new BadRequestException('No valid setting keys provided');
    }
    this.validate(Object.fromEntries(entries));
    await this.db.tx(async (sql) => {
      for (const [key, value] of entries) {
        await sql.query(
          `INSERT INTO settings (key, value, "updatedAt")
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, "updatedAt" = now()`,
          [key, JSON.stringify(value)],
        );
      }
    });
    const all = await this.getAll();
    this.events.emit('settings.updated', all);
    return all;
  }

  private validate(values: Record<string, unknown>) {
    if (
      'siteTitle' in values &&
      (typeof values.siteTitle !== 'string' || !values.siteTitle.trim())
    ) {
      throw new BadRequestException('siteTitle must be a non-empty string');
    }
    if (
      'homepageType' in values &&
      !['latest-posts', 'static-page'].includes(String(values.homepageType))
    ) {
      throw new BadRequestException('Invalid homepageType');
    }
    if ('postsPerPage' in values) {
      const n = Number(values.postsPerPage);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        throw new BadRequestException('postsPerPage must be between 1 and 50');
      }
    }
    if (
      'activeTheme' in values &&
      (typeof values.activeTheme !== 'string' || !values.activeTheme.trim())
    ) {
      throw new BadRequestException('activeTheme must be a non-empty string');
    }
    if (
      'allowRegistration' in values &&
      typeof values.allowRegistration !== 'boolean'
    ) {
      throw new BadRequestException('allowRegistration must be a boolean');
    }
  }
}
