import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  findAll(status?: string) {
    return this.prisma.comment.findMany({
      where: { status: (status as never) ?? undefined },
      include: {
        author: { select: { id: true, name: true } },
        content: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findForContent(contentId: string) {
    return this.prisma.comment.findMany({
      where: { contentId, status: 'APPROVED', parentId: null },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        replies: {
          where: { status: 'APPROVED' },
          include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: {
    contentId: string;
    body: string;
    authorId?: string;
    guestName?: string;
    guestEmail?: string;
    parentId?: string;
  }) {
    const comment = await this.prisma.comment.create({
      data: {
        contentId: data.contentId,
        body: data.body,
        authorId: data.authorId ?? null,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        parentId: data.parentId ?? null,
        // Logged-in users' comments are auto-approved
        status: data.authorId ? 'APPROVED' : 'PENDING',
      },
    });
    this.events.emit('comment.created', comment);
    return comment;
  }

  setStatus(id: string, status: string) {
    return this.prisma.comment.update({
      where: { id },
      data: { status: status as never },
    });
  }

  remove(id: string) {
    return this.prisma.comment.delete({ where: { id }, select: { id: true } });
  }
}
