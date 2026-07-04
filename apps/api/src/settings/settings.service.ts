import { Injectable } from '@nestjs/common';
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
};

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async getAll() {
    const rows = await this.prisma.setting.findMany();
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async updateMany(values: Record<string, unknown>) {
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
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
}
