import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { HooksService } from '../hooks/hooks.service';
import { newId } from '../db/ids';
import { kses } from '../html/kses';
import { currentSiteId } from '../sites/site-context';
import { initialCommentStatus } from './comment-policy';
import { MAX_COMMENT_DEPTH, commentDepth, threadComments } from './comment-thread';

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
    private hooks: HooksService,
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
         AND content."siteId" = $2
       ORDER BY c."createdAt" DESC`,
      [status ?? null, currentSiteId()],
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
       JOIN contents content ON content.id = c."contentId"
       WHERE c."contentId" = $1 AND c.status = 'APPROVED' AND content."siteId" = $2
       ORDER BY c."createdAt" ASC`,
      [contentId, currentSiteId()],
    );
    return threadComments(rows);
  }

  async create(data: {
    contentId: string;
    body: string;
    authorId?: string;
    guestName?: string;
    guestEmail?: string;
    parentId?: string;
    authorIp?: string;
    userAgent?: string;
  }) {
    // Guests must identify themselves
    if (!data.authorId && !data.guestName?.trim()) {
      throw new BadRequestException('Name is required to comment');
    }
    // Comments are only allowed on published content
    const content = await this.db.one<{
      status: string;
      visibility: string;
      commentStatus: string;
    }>(
      'SELECT status, visibility, "commentStatus" FROM contents WHERE id = $1',
      [data.contentId],
    );
    if (!content || content.status !== 'PUBLISHED' || content.visibility === 'PRIVATE') {
      throw new NotFoundException('Content not found or not published');
    }
    if (content.commentStatus === 'closed') {
      throw new BadRequestException('Comments are closed');
    }
    const flags = await this.db.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
      [['allowComments', 'commentModeration', 'commentRegistration']],
    );
    const flag = Object.fromEntries(flags.map((row) => [row.key, row.value]));
    if (flag.allowComments === false) {
      throw new BadRequestException('Comments are closed');
    }
    if (flag.commentRegistration === true && !data.authorId) {
      throw new BadRequestException('Sign in to leave a comment');
    }
    const status = initialCommentStatus({
      body: data.body,
      authenticated: Boolean(data.authorId),
      moderation: flag.commentModeration !== false,
    });
    if (data.parentId) {
      const parent = await this.db.one<{ contentId: string }>(
        'SELECT "contentId" FROM comments WHERE id = $1',
        [data.parentId],
      );
      if (!parent || parent.contentId !== data.contentId) {
        throw new BadRequestException('Invalid parent comment');
      }
      const family = await this.db.query<{ id: string; parentId: string | null }>(
        'SELECT id, "parentId" FROM comments WHERE "contentId" = $1',
        [data.contentId],
      );
      if (commentDepth(family, data.parentId) > MAX_COMMENT_DEPTH) {
        throw new BadRequestException(`Comments can be nested ${MAX_COMMENT_DEPTH} levels deep`);
      }
    }
    const comment = await this.db.one(
      `INSERT INTO comments (
         id, "contentId", "authorId", "guestName", "guestEmail", body, status, "parentId",
         "authorIp", "userAgent"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::"CommentStatus", $8, $9, $10)
       RETURNING id, "contentId", "authorId", "guestName", "guestEmail", body, status, "parentId", "createdAt"`,
      [
        newId(),
        data.contentId,
        data.authorId ?? null,
        data.guestName ?? null,
        data.guestEmail ?? null,
        kses(data.body),
        status,
        data.parentId ?? null,
        data.authorIp?.slice(0, 64) ?? null,
        data.userAgent?.slice(0, 300) ?? null,
      ],
    );
    await this.hooks.doAction('comment.created', comment);
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

  listMeta(commentId: string) {
    return this.db.query(
      `SELECT "metaKey", "metaValue" FROM comment_meta WHERE "commentId" = $1 ORDER BY "metaKey"`,
      [commentId],
    );
  }

  async upsertMeta(commentId: string, key: string, value: unknown) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) throw new BadRequestException('Invalid meta key');
    const comment = await this.db.one('SELECT id FROM comments WHERE id = $1', [commentId]);
    if (!comment) throw new NotFoundException('Comment not found');
    await this.db.query(
      `INSERT INTO comment_meta (id, "commentId", "metaKey", "metaValue")
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT ("commentId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
      [newId(), commentId, key, JSON.stringify(value ?? null)],
    );
    return { key, value };
  }

  async deleteMeta(commentId: string, key: string) {
    const row = await this.db.one(
      'DELETE FROM comment_meta WHERE "commentId" = $1 AND "metaKey" = $2 RETURNING id',
      [commentId, key],
    );
    if (!row) throw new NotFoundException('Meta not found');
    return { deleted: true };
  }
}
