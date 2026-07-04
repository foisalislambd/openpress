import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  siteTitle: 'OpenPress Site',
  siteDescription: 'A modern site powered by OpenPress',
  activeTheme: 'default',
  homepageType: 'latest-posts',
  homepageId: null,
  postsPerPage: 10,
  allowRegistration: false,
};

// Only these keys can be written via the public settings API. Internal keys
// (e.g. enabledPlugins) are managed by their own services and never exposed.
const PUBLIC_KEYS = Object.keys(DEFAULT_SETTINGS);

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async getAll() {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: PUBLIC_KEYS } },
    });
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
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
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        }),
      ),
    );
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
