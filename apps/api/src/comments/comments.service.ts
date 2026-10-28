import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';

type CommentRow = {
  id: string;
  contentId: string;
  authorId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  body: string;
  status: string;
  parentId: string | null;
  createdAt: Date;
  author: { id: string; name: string; avatarUrl?: string | null } | null;
};

const COMMENT_COLUMNS = `c.id, c."contentId", c."authorId", c."guestName", c."guestEmail",
  c.body, c.status, c."parentId", c."createdAt"`;

@Injectable()
export class CommentsService {
  constructor(
    private db: DbService,
    private events: EventEmitter2,
  ) {}

  findAll(status?: string) {
    const allowed = ['PENDING', 'APPROVED', 'SPAM', 'TRASHED'];
    if (status && !allowed.includes(status)) {
      throw new BadRequestException('Invalid comment status');
    }
    return this.db.query(
      `SELECT ${COMMENT_COLUMNS},
              CASE WHEN u.id IS NULL THEN NULL
                   ELSE json_build_object('id', u.id, 'name', u.name)
              END AS author,
              json_build_object('id', content.id, 'title', content.title, 'slug', content.slug) AS content
       FROM comments c
       LEFT JOIN users u ON u.id = c."authorId"
       JOIN contents content ON content.id = c."contentId"
       WHERE ($1::text IS NULL OR c.status = $1::"CommentStatus")
       ORDER BY c."createdAt" DESC`,
      [status ?? null],
    );
  }

  async findForContent(contentId: string) {
    const rows = await this.db.query<CommentRow>(
      `SELECT ${COMMENT_COLUMNS},
              CASE WHEN u.id IS NULL THEN NULL
                   ELSE json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl")
              END AS author
       FROM comments c
       LEFT JOIN users u ON u.id = c."authorId"
       WHERE c."contentId" = $1 AND c.status = 'APPROVED'
       ORDER BY c."createdAt" ASC`,
      [contentId],
    );
    return rows
      .filter((row) => row.parentId === null)
      .map((row) => ({
        ...row,
        replies: rows.filter((reply) => reply.parentId === row.id),
      }));
  }

  async create(data: {
    contentId: string;
    body: string;
    authorId?: string;
    guestName?: string;
    guestEmail?: string;
    parentId?: string;
  }) {
    // Guests must identify themselves
    if (!data.authorId && !data.guestName?.trim()) {
      throw new BadRequestException('Name is required to comment');
    }
    // Comments are only allowed on published content
    const content = await this.db.one<{ status: string }>(
      'SELECT status FROM contents WHERE id = $1',
      [data.contentId],
    );
    if (!content || content.status !== 'PUBLISHED') {
      throw new NotFoundException('Content not found or not published');
    }
    if (data.parentId) {
      const parent = await this.db.one<{ contentId: string }>(
        'SELECT "contentId" FROM comments WHERE id = $1',
        [data.parentId],
      );
      if (!parent || parent.contentId !== data.contentId) {
        throw new BadRequestException('Invalid parent comment');
      }
    }
    const comment = await this.db.one(
      `INSERT INTO comments (
         id, "contentId", "authorId", "guestName", "guestEmail", body, status, "parentId"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::"CommentStatus", $8)
       RETURNING id, "contentId", "authorId", "guestName", "guestEmail", body, status, "parentId", "createdAt"`,
      [
        newId(),
        data.contentId,
        data.authorId ?? null,
        data.guestName ?? null,
        data.guestEmail ?? null,
        data.body,
        data.authorId ? 'APPROVED' : 'PENDING',
        data.parentId ?? null,
      ],
    );
    this.events.emit('comment.created', comment);
    return comment;
  }

  async setStatus(id: string, status: string) {
    const comment = await this.db.one(
      `UPDATE comments SET status = $2::"CommentStatus"
       WHERE id = $1
       RETURNING id, "contentId", "authorId", "guestName", "guestEmail", body, status, "parentId", "createdAt"`,
      [id, status],
    );
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  async remove(id: string) {
    const comment = await this.db.one<{ id: string }>(
      'DELETE FROM comments WHERE id = $1 RETURNING id',
      [id],
    );
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}
