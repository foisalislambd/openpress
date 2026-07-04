import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import slugify from 'slugify';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';
import {
  CreateContentDto,
  QueryContentDto,
  UpdateContentDto,
} from './content.dto';

const listInclude = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  categories: true,
  tags: true,
  _count: { select: { comments: true } },
} as const;

@Injectable()
export class ContentService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async findAll(query: QueryContentDto, publicOnly = false) {
    const page = Math.max(1, Number(query.page ?? 1));
    const perPage = Math.min(50, Math.max(1, Number(query.perPage ?? 10)));

    const where: Prisma.ContentWhereInput = {
      type: (query.type as never) ?? undefined,
      status: publicOnly ? 'PUBLISHED' : ((query.status as never) ?? undefined),
    };
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { excerpt: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.categories = { some: { slug: query.category } };
    if (query.tag) where.tags = { some: { slug: query.tag } };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.content.findMany({
        where,
        include: listInclude,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.content.count({ where }),
    ]);
    return { items, total, page, perPage, totalPages: Math.ceil(total / perPage) };
  }

  async findBySlug(slug: string, publicOnly = false) {
    const content = await this.prisma.content.findUnique({
      where: { slug },
      include: listInclude,
    });
    if (!content || (publicOnly && content.status !== 'PUBLISHED')) {
      throw new NotFoundException('Content not found');
    }
    return content;
  }

  async findOne(id: string, publicOnly = false) {
    const content = await this.prisma.content.findUnique({
      where: { id },
      include: listInclude,
    });
    if (!content || (publicOnly && content.status !== 'PUBLISHED')) {
      throw new NotFoundException('Content not found');
    }
    return content;
  }

  async create(dto: CreateContentDto, user: JwtPayload) {
    // Pages affect site structure; authors may only manage posts (like WordPress)
    if (dto.type === 'PAGE' && user.role === 'AUTHOR') {
      throw new ForbiddenException('Only editors and admins can create pages');
    }
    const slug = await this.uniqueSlug(dto.slug || dto.title);
    const status = dto.status ?? 'DRAFT';
    const content = await this.prisma.content.create({
      data: {
        title: dto.title,
        slug,
        type: dto.type ?? 'POST',
        status,
        excerpt: dto.excerpt,
        blocks: (dto.blocks ?? []) as Prisma.InputJsonValue,
        seo: (dto.seo ?? {}) as Prisma.InputJsonValue,
        coverImage: dto.coverImage,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        authorId: user.sub,
        categories: dto.categoryIds
          ? { connect: dto.categoryIds.map((id) => ({ id })) }
          : undefined,
        tags: dto.tagIds
          ? { connect: dto.tagIds.map((id) => ({ id })) }
          : undefined,
      },
      include: listInclude,
    });
    this.events.emit('content.created', content);
    if (status === 'PUBLISHED') this.events.emit('content.published', content);
    return content;
  }

  async update(id: string, dto: UpdateContentDto, user: JwtPayload) {
    const existing = await this.findOne(id);
    if (user.role === 'AUTHOR' && existing.authorId !== user.sub) {
      throw new ForbiddenException('You can only edit your own content');
    }
    if (existing.type === 'PAGE' && user.role === 'AUTHOR') {
      throw new ForbiddenException('Only editors and admins can edit pages');
    }

    // Snapshot a revision before applying changes
    await this.prisma.revision.create({
      data: {
        contentId: id,
        title: existing.title,
        blocks: existing.blocks as Prisma.InputJsonValue,
        authorId: user.sub,
      },
    });

    const becomingPublished =
      dto.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';

    const content = await this.prisma.content.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        slug: dto.slug ? await this.uniqueSlug(dto.slug, id) : undefined,
        type: (dto.type as never) ?? undefined,
        status: (dto.status as never) ?? undefined,
        excerpt: dto.excerpt ?? undefined,
        blocks:
          dto.blocks !== undefined
            ? (dto.blocks as Prisma.InputJsonValue)
            : undefined,
        seo:
          dto.seo !== undefined ? (dto.seo as Prisma.InputJsonValue) : undefined,
        coverImage: dto.coverImage ?? undefined,
        publishedAt: becomingPublished ? new Date() : undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        categories: dto.categoryIds
          ? { set: dto.categoryIds.map((cid) => ({ id: cid })) }
          : undefined,
        tags: dto.tagIds
          ? { set: dto.tagIds.map((tid) => ({ id: tid })) }
          : undefined,
      },
      include: listInclude,
    });
    this.events.emit('content.updated', content);
    if (becomingPublished) this.events.emit('content.published', content);
    return content;
  }

  async remove(id: string, user: JwtPayload) {
    const existing = await this.findOne(id);
    if (user.role === 'AUTHOR' && existing.authorId !== user.sub) {
      throw new ForbiddenException('You can only delete your own content');
    }
    const removed = await this.prisma.content.delete({ where: { id } });
    this.events.emit('content.deleted', removed);
    return { id };
  }

  revisions(contentId: string) {
    return this.prisma.revision.findMany({
      where: { contentId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { author: { select: { id: true, name: true } } },
    });
  }

  private async uniqueSlug(source: string, excludeId?: string) {
    const base =
      slugify(source, { lower: true, strict: true }) || 'untitled';
    let slug = base;
    let i = 1;
    // Append -2, -3, ... until the slug is free
    for (;;) {
      const clash = await this.prisma.content.findUnique({ where: { slug } });
      if (!clash || clash.id === excludeId) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
}
