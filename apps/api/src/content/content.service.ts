import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import slugify from 'slugify';
import { Db, DbService } from '../db/db.service';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { JwtPayload } from '../auth/jwt.strategy';
import {
  CreateContentDto,
  QueryContentDto,
  UpdateContentDto,
} from './content.dto';

const CONTENT_COLUMNS = `c.id, c.type, c.status, c.title, c.slug, c.excerpt, c.blocks, c.seo,
  c."coverImage", c."publishedAt", c."scheduledAt", c."authorId", c."createdAt", c."updatedAt"`;

type Author = { id: string; name: string; avatarUrl: string | null };

type ContentRow = {
  id: string;
  type: string;
  status: string;
  title: string;
  slug: string;
  excerpt: string | null;
  blocks: unknown;
  seo: unknown;
  coverImage: string | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  author: Author;
};

type CategoryLink = {
  contentId: string;
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  createdAt: Date;
};

type TagLink = {
  contentId: string;
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

@Injectable()
export class ContentService {
  constructor(
    private db: DbService,
    private events: EventEmitter2,
  ) {}

  async findAll(query: QueryContentDto, publicOnly = false) {
    const page = positiveInt(query.page, 1);
    const perPage = Math.min(50, positiveInt(query.perPage, 10));
    const { where, params } = this.filters(query, publicOnly);
    const limit = params.length + 1;
    const offset = params.length + 2;
    const [rows, totalRow] = await Promise.all([
      this.db.query<ContentRow>(
        `SELECT ${CONTENT_COLUMNS},
                json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl") AS author
         FROM contents c
         JOIN users u ON u.id = c."authorId"
         ${where}
         ORDER BY c."publishedAt" DESC NULLS FIRST, c."createdAt" DESC
         LIMIT $${limit} OFFSET $${offset}`,
        [...params, perPage, (page - 1) * perPage],
      ),
      this.db.one<{ count: number }>(
        `SELECT count(*)::int AS count FROM contents c ${where}`,
        params,
      ),
    ]);
    const items = await this.hydrate(rows);
    const total = totalRow?.count ?? 0;
    return { items, total, page, perPage, totalPages: Math.ceil(total / perPage) };
  }

  async findBySlug(slug: string, publicOnly = false) {
    const content = await this.findRow('slug', slug);
    if (!content || (publicOnly && content.status !== 'PUBLISHED')) {
      throw new NotFoundException('Content not found');
    }
    return content;
  }

  async findOne(id: string, publicOnly = false) {
    const content = await this.findRow('id', id);
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
    const id = newId();
    try {
    await this.db.tx(async (sql) => {
      await sql.query(
        `INSERT INTO contents (
           id, type, status, title, slug, excerpt, blocks, seo, "coverImage",
           "publishedAt", "scheduledAt", "authorId", "updatedAt"
         ) VALUES (
           $1, $2::"ContentType", $3::"ContentStatus", $4, $5, $6, $7::jsonb, $8::jsonb, $9,
           $10, $11, $12, now()
         )`,
        [
          id,
          dto.type ?? 'POST',
          status,
          dto.title,
          slug,
          dto.excerpt ?? null,
          JSON.stringify(dto.blocks ?? []),
          JSON.stringify(dto.seo ?? {}),
          dto.coverImage ?? null,
          status === 'PUBLISHED' ? new Date() : null,
          dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          user.sub,
        ],
      );
      await this.linkTerms(sql, id, dto.categoryIds, dto.tagIds, false);
    });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Slug already in use');
      throw error;
    }
    const content = await this.findOne(id);
    this.events.emit('content.created', content);
    if (status === 'PUBLISHED') this.events.emit('content.published', content);
    return content;
  }

  async update(id: string, dto: UpdateContentDto, user: JwtPayload) {
    const existing = await this.findOne(id);
    if (user.role === 'AUTHOR' && existing.authorId !== user.sub) {
      throw new ForbiddenException('You can only edit your own content');
    }
    if (
      user.role === 'AUTHOR' &&
      (existing.type === 'PAGE' || dto.type === 'PAGE')
    ) {
      throw new ForbiddenException('Only editors and admins can edit pages');
    }

    const becomingPublished =
      dto.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';

    try {
    await this.db.tx(async (sql) => {
      await sql.query(
        `INSERT INTO revisions (id, "contentId", title, blocks, "authorId")
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [
          newId(),
          id,
          existing.title,
          JSON.stringify(existing.blocks ?? []),
          user.sub,
        ],
      );

      const sets: string[] = [];
      const params: unknown[] = [];
      const add = (column: string, value: unknown, cast = '') => {
        params.push(value);
        sets.push(`${column} = $${params.length}${cast}`);
      };
      if (dto.title != null) add('title', dto.title);
      if (dto.slug) add('slug', await this.uniqueSlug(dto.slug, id, sql));
      if (dto.type != null) add('type', dto.type, '::"ContentType"');
      if (dto.status != null) add('status', dto.status, '::"ContentStatus"');
      if (dto.excerpt != null) add('excerpt', dto.excerpt);
      if (dto.blocks !== undefined) add('blocks', JSON.stringify(dto.blocks), '::jsonb');
      if (dto.seo !== undefined) add('seo', JSON.stringify(dto.seo), '::jsonb');
      if (dto.coverImage != null) add('"coverImage"', dto.coverImage);
      if (becomingPublished) add('"publishedAt"', new Date());
      if (dto.scheduledAt) add('"scheduledAt"', new Date(dto.scheduledAt));
      sets.push('"updatedAt" = now()');
      params.push(id);
      await sql.query(
        `UPDATE contents SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params,
      );
      await this.linkTerms(sql, id, dto.categoryIds, dto.tagIds, true);
    });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Slug already in use');
      throw error;
    }

    const content = await this.findOne(id);
    this.events.emit('content.updated', content);
    if (becomingPublished) this.events.emit('content.published', content);
    return content;
  }

  async remove(id: string, user: JwtPayload) {
    const existing = await this.findOne(id);
    if (user.role === 'AUTHOR' && existing.authorId !== user.sub) {
      throw new ForbiddenException('You can only delete your own content');
    }
    const removed = await this.db.one(
      `DELETE FROM contents WHERE id = $1
       RETURNING id, type, status, title, slug, excerpt, blocks, seo, "coverImage",
                 "publishedAt", "scheduledAt", "authorId", "createdAt", "updatedAt"`,
      [id],
    );
    if (!removed) throw new NotFoundException('Content not found');
    this.events.emit('content.deleted', removed);
    return { id };
  }

  async revisions(contentId: string) {
    return this.db.query(
      `SELECT r.id, r."contentId", r.title, r.blocks, r."authorId", r."createdAt",
              json_build_object('id', u.id, 'name', u.name) AS author
       FROM revisions r
       JOIN users u ON u.id = r."authorId"
       WHERE r."contentId" = $1
       ORDER BY r."createdAt" DESC
       LIMIT 20`,
      [contentId],
    );
  }

  private filters(query: QueryContentDto, publicOnly: boolean) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, ...values: unknown[]) => {
      let sql = clause;
      for (const value of values) {
        params.push(value);
        sql = sql.replace('$?', () => `$${params.length}`);
      }
      clauses.push(sql);
    };

    if (query.type) add('c.type = $?::"ContentType"', query.type);
    if (publicOnly) add(`c.status = 'PUBLISHED'`);
    else if (query.status) add('c.status = $?::"ContentStatus"', query.status);
    else add(`c.status <> 'TRASHED'`);

    if (query.search) {
      const like = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      add(
        `(c.title ILIKE $? ESCAPE '\\' OR c.excerpt ILIKE $? ESCAPE '\\')`,
        like,
        like,
      );
    }
    if (query.category) {
      add(
        `EXISTS (
           SELECT 1 FROM "_ContentCategories" cc
           JOIN categories cat ON cat.id = cc."A"
           WHERE cc."B" = c.id AND cat.slug = $?
         )`,
        query.category,
      );
    }
    if (query.tag) {
      add(
        `EXISTS (
           SELECT 1 FROM "_ContentTags" ct
           JOIN tags tag ON tag.id = ct."B"
           WHERE ct."A" = c.id AND tag.slug = $?
         )`,
        query.tag,
      );
    }

    return {
      where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  private async findRow(column: 'id' | 'slug', value: string) {
    const row = await this.db.one<ContentRow>(
      `SELECT ${CONTENT_COLUMNS},
              json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl") AS author
       FROM contents c
       JOIN users u ON u.id = c."authorId"
       WHERE c."${column}" = $1`,
      [value],
    );
    if (!row) return null;
    const [content] = await this.hydrate([row]);
    return content;
  }

  private async hydrate(rows: ContentRow[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [categories, tags, counts] = await Promise.all([
      this.db.query<CategoryLink>(
        `SELECT cc."B" AS "contentId", cat.id, cat.name, cat.slug, cat.description,
                cat."parentId", cat."createdAt"
         FROM categories cat
         JOIN "_ContentCategories" cc ON cc."A" = cat.id
         WHERE cc."B" = ANY($1::text[])
         ORDER BY cat.name ASC`,
        [ids],
      ),
      this.db.query<TagLink>(
        `SELECT ct."A" AS "contentId", tag.id, tag.name, tag.slug, tag."createdAt"
         FROM tags tag
         JOIN "_ContentTags" ct ON ct."B" = tag.id
         WHERE ct."A" = ANY($1::text[])
         ORDER BY tag.name ASC`,
        [ids],
      ),
      this.db.query<{ contentId: string; count: number }>(
        `SELECT "contentId", count(*)::int AS count
         FROM comments
         WHERE "contentId" = ANY($1::text[])
         GROUP BY "contentId"`,
        [ids],
      ),
    ]);

    const categoriesByContent = group(categories);
    const tagsByContent = group(tags);
    const countsByContent = new Map(counts.map((row) => [row.contentId, row.count]));

    return rows.map((row) => ({
      ...row,
      categories: categoriesByContent.get(row.id) ?? [],
      tags: tagsByContent.get(row.id) ?? [],
      _count: { comments: countsByContent.get(row.id) ?? 0 },
    }));
  }

  private async linkTerms(
    sql: Db,
    contentId: string,
    categoryIds: string[] | undefined,
    tagIds: string[] | undefined,
    replace: boolean,
  ) {
    if (categoryIds) {
      const ids = [...new Set(categoryIds)];
      await this.assertIds(sql, 'categories', ids);
      if (replace) {
        await sql.query('DELETE FROM "_ContentCategories" WHERE "B" = $1', [contentId]);
      }
      if (ids.length) {
        await sql.query(
          `INSERT INTO "_ContentCategories" ("A", "B")
           SELECT category_id, $1 FROM unnest($2::text[]) AS category_id`,
          [contentId, ids],
        );
      }
    }
    if (tagIds) {
      const ids = [...new Set(tagIds)];
      await this.assertIds(sql, 'tags', ids);
      if (replace) {
        await sql.query('DELETE FROM "_ContentTags" WHERE "A" = $1', [contentId]);
      }
      if (ids.length) {
        await sql.query(
          `INSERT INTO "_ContentTags" ("A", "B")
           SELECT $1, tag_id FROM unnest($2::text[]) AS tag_id`,
          [contentId, ids],
        );
      }
    }
  }

  private async assertIds(sql: Db, table: 'categories' | 'tags', ids: string[]) {
    if (ids.length === 0) return;
    const rows = await sql.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE id = ANY($1::text[])`,
      [ids],
    );
    if (rows.length !== ids.length) {
      throw new BadRequestException(
        table === 'categories'
          ? 'One or more categories were not found'
          : 'One or more tags were not found',
      );
    }
  }

  private async uniqueSlug(source: string, excludeId?: string, sql: Db = this.db) {
    const base = slugify(source, { lower: true, strict: true }) || 'untitled';
    let slug = base;
    let i = 1;
    for (;;) {
      const clash = await sql.one<{ id: string }>(
        'SELECT id FROM contents WHERE slug = $1',
        [slug],
      );
      if (!clash || clash.id === excludeId) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function group<T extends { contentId: string }>(rows: T[]) {
  const map = new Map<string, Omit<T, 'contentId'>[]>();
  for (const row of rows) {
    const { contentId, ...rest } = row;
    const list = map.get(contentId) ?? [];
    list.push(rest);
    map.set(contentId, list);
  }
  return map;
}
