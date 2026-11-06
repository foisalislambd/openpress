import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CoreRegistry } from '../core/core-registry';
import { DbService } from '../db/db.service';
import { isUndefinedTable } from '../db/errors';
import { HooksService } from '../hooks/hooks.service';
import { MenusService } from '../menus/menus.service';
import { WidgetsService } from '../widgets/widgets.service';
import { normalizeOptionValue, OptionDefinition, validateOptionValue } from './option-defs';

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
  blogPublic: true,
  defaultOgImage: '',
  twitterSite: '',
  additionalCss: '',
  themeMods: {},
  commentNotify: true,
  languages: ['en'],
  privacyPageId: null,
  defaultCategoryId: null,
  defaultRole: 'AUTHOR',
  menus: [],
  menuLocations: { primary: 'Primary', footer: '' },
  widgets: { sidebar: [], footer: [] },
};

// Only these keys can be written via the public settings API. Internal keys
// (e.g. enabledPlugins) are managed by their own services and never exposed.
const PUBLIC_KEYS = Object.keys(DEFAULT_SETTINGS);

@Injectable()
export class SettingsService {
  constructor(
    private db: DbService,
    private hooks: HooksService,
    private registry: CoreRegistry,
    private menus: MenusService,
    private widgets: WidgetsService,
  ) {}

  definitions(): OptionDefinition[] {
    const core = Object.entries(DEFAULT_SETTINGS).map(([key, defaultValue]) => ({
      key,
      group: groupFor(key),
      type: typeFor(defaultValue),
      autoload: key !== 'additionalCss',
      label: key,
      public: true,
      defaultValue,
      source: 'core',
    }));
    return [...core, ...this.registry.optionsFor()];
  }

  async getAll() {
    const rows = await this.db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
      [PUBLIC_KEYS],
    );
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    let all: Record<string, unknown> = { ...DEFAULT_SETTINGS, ...stored };
    all = await this.menus.overlay(all);
    all = await this.widgets.overlay(all);
    return all;
  }

  async setRegistered(key: string, value: unknown) {
    const def = this.definitions().find((item) => item.key === key);
    if (!def) throw new NotFoundException('Setting is not registered');
    const error = validateOptionValue(def, value);
    if (error) throw new BadRequestException(error);
    const stored = normalizeOptionValue(def, value);
    await this.write(key, stored, def.autoload);
    return { key, value: stored };
  }

  async updateMany(values: Record<string, unknown>) {
    const entries = Object.entries(values).filter(([key]) =>
      PUBLIC_KEYS.includes(key),
    );
    if (entries.length === 0) {
      throw new BadRequestException('No valid setting keys provided');
    }
    const payload = Object.fromEntries(entries);
    this.validate(payload);
    await this.db.tx(async (sql) => {
      for (const [key, value] of entries) {
        const def = this.definitions().find((item) => item.key === key);
        await sql.query(
          `INSERT INTO settings (key, value, autoload, "updatedAt")
           VALUES ($1, $2::jsonb, $3, now())
           ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, autoload = EXCLUDED.autoload, "updatedAt" = now()`,
          [key, JSON.stringify(value), def?.autoload !== false],
        );
      }
    });
    await this.projectStructured(payload);
    const all = await this.getAll();
    await this.hooks.doAction('settings.updated', all);
    return all;
  }

  private validate(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      const def = this.definitions().find((item) => item.key === key);
      if (!def) continue;
      const error = validateOptionValue(def, value);
      if (error) throw new BadRequestException(error);
    }
    if (
      'homepageType' in values &&
      !['latest-posts', 'static-page'].includes(String(values.homepageType))
    ) {
      throw new BadRequestException('Invalid homepageType');
    }
    if ('defaultRole' in values && !/^[A-Z][A-Z0-9_]{1,40}$/.test(String(values.defaultRole))) {
      throw new BadRequestException('defaultRole must be a role slug');
    }
  }

  private async projectStructured(values: Record<string, unknown>) {
    try {
      if ('menus' in values || 'menuLocations' in values) {
        await this.menus.importSettings(values.menus, values.menuLocations);
      }
      if ('widgets' in values) await this.widgets.importSettings(values.widgets);
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
    }
  }

  private async write(key: string, value: unknown, autoload: boolean) {
    await this.db.query(
      `INSERT INTO settings (key, value, autoload, "updatedAt")
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, autoload = EXCLUDED.autoload, "updatedAt" = now()`,
      [key, JSON.stringify(value), autoload],
    );
  }
}

function typeFor(value: unknown): OptionDefinition['type'] {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value === null || typeof value === 'object') return 'json';
  return 'string';
}

function groupFor(key: string) {
  if (['thumbnailSize', 'mediumSize', 'largeSize'].includes(key)) return 'media';
  if (['allowComments', 'commentModeration', 'commentRegistration', 'commentNotify'].includes(key)) return 'discussion';
  if (['permalinkStructure'].includes(key)) return 'permalinks';
  if (['blogPublic', 'defaultOgImage', 'twitterSite'].includes(key)) return 'seo';
  if (['homepageType', 'homepageId', 'postsPerPage'].includes(key)) return 'reading';
  if (['languages', 'siteLanguage'].includes(key)) return 'languages';
  if (['menus', 'menuLocations', 'widgets', 'activeTheme', 'themeMods', 'additionalCss'].includes(key)) return 'appearance';
  return 'general';
}
