import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import slugify from 'slugify';
import { can, publishCapability } from '../auth/capabilities';
import { JwtPayload } from '../auth/jwt.strategy';
import { Db, DbService } from '../db/db.service';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { ExtensionRegistry } from '../extensions/extension-registry';
import { HooksService } from '../hooks/hooks.service';
import {
  AutosaveDto,
  CreateContentDto,
  QueryContentDto,
  UpdateContentDto,
} from './content.dto';
import { redactPasswordContent, signUnlock, verifyUnlock } from './visibility';

const CONTENT_COLUMNS = `c.id, c.type, c.status, c.visibility, c.sticky, c."commentStatus",
  c.title, c.slug, c.excerpt, c.blocks, c.seo,
  c."coverImage", c."publishedAt", c."scheduledAt", c."authorId", c."createdAt", c."updatedAt"`;

const META_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

type Author = { id: string; name: string; avatarUrl: string | null };

type ContentRow = {
  id: string;
  type: string;
  status: string;
  visibility: string;
  sticky: boolean;
  commentStatus: string;
  title: string;
  slug: string;
  excerpt: string | null;
  blocks: unknown[];
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
  private readonly unlockSecret: string;

  constructor(
    private db: DbService,
    private hooks: HooksService,
    private registry: ExtensionRegistry,
    config: ConfigService,
  ) {
    this.unlockSecret = config.get<string>('JWT_SECRET') ?? 'openpress-dev-secret';
  }

  async findAll(query: QueryContentDto, publicOnly = false) {
    const shaped = publicOnly ? await this.shapePublicQuery(query) : query;
    const page = positiveInt(shaped.page, 1);
    const perPage = Math.min(50, positiveInt(shaped.perPage, 10));
    const { where, params } = this.filters(shaped, publicOnly);
    const limit = params.length + 1;
    const offset = params.length + 2;
    const order = publicOnly
      ? `ORDER BY c.sticky DESC, c."publishedAt" DESC NULLS LAST, c."createdAt" DESC`
      : `ORDER BY c."publishedAt" DESC NULLS FIRST, c."createdAt" DESC`;
    const [rows, totalRow] = await Promise.all([
      this.db.query<ContentRow>(
        `SELECT ${CONTENT_COLUMNS},
                json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl") AS author
         FROM contents c
         JOIN users u ON u.id = c."authorId"
         ${where}
         ${order}
         LIMIT $${limit} OFFSET $${offset}`,
        [...params, perPage, (page - 1) * perPage],
      ),
      this.db.one<{ count: number }>(
        `SELECT count(*)::int AS count FROM contents c ${where}`,
        params,
      ),
    ]);
    let items = await this.hydrate(rows);
    if (publicOnly) {
      items = await Promise.all(
        items.map(async (item) => this.decoratePublic(redactPasswordContent(item, false))),
      );
    }
    const total = totalRow?.count ?? 0;
    return { items, total, page, perPage, totalPages: Math.ceil(total / perPage) };
  }

  async findBySlug(slug: string, publicOnly = false, unlock?: string) {
    const content = await this.findRow('slug', slug);
    if (!content) throw new NotFoundException('Content not found');
    if (publicOnly) return this.presentPublic(content, unlock);
    return content;
  }

  async findOne(id: string, publicOnly = false, unlock?: string) {
    const content = await this.findRow('id', id);
    if (!content) throw new NotFoundException('Content not found');
    if (publicOnly) return this.presentPublic(content, unlock);
    return { ...content, meta: await this.listMeta(id) };
  }

  async unlock(slug: string, password: string) {
    const content = await this.findRow('slug', slug);
    if (!content || content.status !== 'PUBLISHED' || content.visibility !== 'PASSWORD') {
      throw new NotFoundException('Content not found');
    }
    const hash = await this.passwordHashOf(content.id);
    if (!hash || !(await bcrypt.compare(password, hash))) {
      throw new UnauthorizedException('Incorrect password');
    }
    return { token: signUnlock(this.unlockSecret, content.slug), slug: content.slug };
  }

  async create(dto: CreateContentDto, user: JwtPayload) {
    const type = dto.type ?? 'POST';
    this.assertCanCreate(user, type);
    const status = dto.status ?? 'DRAFT';
    this.assertCanSetStatus(user, status, type);
    if (status === 'SCHEDULED' && !dto.scheduledAt) {
      throw new BadRequestException('scheduledAt is required to schedule');
    }
    const visibility = dto.visibility ?? 'PUBLIC';
    const passwordHash = await this.passwordForWrite(visibility, dto.password, null);
    const slug = await this.uniqueSlug(dto.slug || dto.title);
    const blocks = await this.filterBlocks(dto.blocks ?? [], user);
    const id = newId();
    try {
      await this.db.tx(async (sql) => {
        await sql.query(
          `INSERT INTO contents (
             id, type, status, visibility, sticky, "commentStatus", title, slug, excerpt,
             blocks, seo, "coverImage", "passwordHash", "publishedAt", "scheduledAt",
             "authorId", "updatedAt"
           ) VALUES (
             $1, $2::"ContentType", $3::"ContentStatus", $4, $5, $6, $7, $8, $9,
             $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, now()
           )`,
          [
            id,
            type,
            status,
            visibility,
            dto.sticky ?? false,
            dto.commentStatus ?? 'open',
            dto.title,
            slug,
            dto.excerpt ?? null,
            JSON.stringify(blocks),
            JSON.stringify(dto.seo ?? {}),
            dto.coverImage ?? null,
            passwordHash,
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
    await this.hooks.doAction('content.created', content);
    if (status === 'PUBLISHED') await this.hooks.doAction('content.published', content);
    return content;
  }

  async update(id: string, dto: UpdateContentDto, user: JwtPayload) {
    const existing = await this.findOne(id);
    this.assertCanEdit(user, existing);
    if (dto.type === 'PAGE' || existing.type === 'PAGE') {
      if (!can(user.role, 'edit_pages')) {
        throw new ForbiddenException('Only editors and admins can edit pages');
      }
    }
    const nextStatus = dto.status ?? existing.status;
    if (dto.status) this.assertCanSetStatus(user, dto.status, dto.type ?? existing.type);
    if (nextStatus === 'SCHEDULED' && !dto.scheduledAt && !existing.scheduledAt) {
      throw new BadRequestException('scheduledAt is required to schedule');
    }
    const nextVisibility = dto.visibility ?? existing.visibility;
    const currentHash = await this.passwordHashOf(id);
    const passwordHash = await this.passwordForWrite(
      nextVisibility,
      dto.password,
      nextVisibility === existing.visibility ? currentHash : currentHash,
    );
    if (nextVisibility === 'PASSWORD' && !dto.password && !currentHash) {
      throw new BadRequestException('A password is required for password-protected content');
    }

    const becomingPublished = dto.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';

    try {
      await this.db.tx(async (sql) => {
        await sql.query(
          `INSERT INTO revisions (id, "contentId", title, blocks, "authorId")
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [newId(), id, existing.title, JSON.stringify(existing.blocks ?? []), user.sub],
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
        if (dto.visibility != null) add('visibility', dto.visibility);
        if (dto.sticky != null) add('sticky', dto.sticky);
        if (dto.commentStatus != null) add('"commentStatus"', dto.commentStatus);
        if (dto.excerpt != null) add('excerpt', dto.excerpt);
        if (dto.blocks !== undefined) {
          const blocks = await this.filterBlocks(dto.blocks, user, id);
          add('blocks', JSON.stringify(blocks), '::jsonb');
        }
        if (dto.seo !== undefined) add('seo', JSON.stringify(dto.seo), '::jsonb');
        if (dto.coverImage != null) add('"coverImage"', dto.coverImage);
        if (nextVisibility !== 'PASSWORD') add('"passwordHash"', null);
        else if (dto.password) add('"passwordHash"', passwordHash);
        if (becomingPublished) add('"publishedAt"', new Date());
        if (dto.scheduledAt) add('"scheduledAt"', new Date(dto.scheduledAt));
        sets.push('"updatedAt" = now()');
        params.push(id);
        await sql.query(
          `UPDATE contents SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params,
        );
        await sql.query(
          'DELETE FROM autosaves WHERE "contentId" = $1 AND "authorId" = $2',
          [id, user.sub],
        );
        await this.linkTerms(sql, id, dto.categoryIds, dto.tagIds, true);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Slug already in use');
      throw error;
    }

    const content = await this.findOne(id);
    await this.hooks.doAction('content.updated', content);
    if (becomingPublished) await this.hooks.doAction('content.published', content);
    return content;
  }

  async remove(id: string, user: JwtPayload) {
    const existing = await this.findOne(id);
    this.assertCanDelete(user, existing);
    const removed = await this.db.one(
      `DELETE FROM contents WHERE id = $1
       RETURNING id, type, status, title, slug`,
      [id],
    );
    if (!removed) throw new NotFoundException('Content not found');
    await this.hooks.doAction('content.deleted', removed);
    return { id };
  }

  async revisions(contentId: string) {
    await this.findOne(contentId);
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

  async restoreRevision(contentId: string, revisionId: string, user: JwtPayload) {
    const existing = await this.findOne(contentId);
    this.assertCanEdit(user, existing);
    const revision = await this.db.one<{ title: string; blocks: unknown }>(
      `SELECT title, blocks FROM revisions WHERE id = $1 AND "contentId" = $2`,
      [revisionId, contentId],
    );
    if (!revision) throw new NotFoundException('Revision not found');
    const blocks = Array.isArray(revision.blocks) ? revision.blocks : [];
    const sameTitle = existing.title === revision.title;
    const sameBlocks = JSON.stringify(existing.blocks ?? []) === JSON.stringify(blocks);
    if (sameTitle && sameBlocks) return existing;
    return this.update(contentId, { title: revision.title, blocks }, user);
  }

  async getAutosave(contentId: string, user: JwtPayload) {
    await this.findOne(contentId);
    return this.db.one(
      `SELECT id, "contentId", title, blocks, excerpt, "updatedAt"
       FROM autosaves
       WHERE "contentId" = $1 AND "authorId" = $2`,
      [contentId, user.sub],
    );
  }

  async autosave(contentId: string, dto: AutosaveDto, user: JwtPayload) {
    const existing = await this.findOne(contentId);
    this.assertCanEdit(user, existing);
    const blocks = await this.filterBlocks(dto.blocks, user, contentId);
    await this.db.query(
      `INSERT INTO autosaves (id, "contentId", "authorId", title, blocks, excerpt, "updatedAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
       ON CONFLICT ("contentId", "authorId") DO UPDATE
       SET title = EXCLUDED.title, blocks = EXCLUDED.blocks, excerpt = EXCLUDED.excerpt, "updatedAt" = now()`,
      [newId(), contentId, user.sub, dto.title, JSON.stringify(blocks), dto.excerpt ?? null],
    );
    return this.getAutosave(contentId, user);
  }

  async listMeta(contentId: string) {
    return this.db.query<{ id: string; key: string; value: unknown }>(
      `SELECT id, "metaKey" AS key, "metaValue" AS value
       FROM content_meta
       WHERE "contentId" = $1
       ORDER BY "metaKey" ASC`,
      [contentId],
    );
  }

  async upsertMeta(contentId: string, key: string, value: unknown, user: JwtPayload) {
    const existing = await this.findOne(contentId);
    this.assertCanEdit(user, existing);
    if (!META_KEY.test(key)) {
      throw new BadRequestException('Meta keys must start with a letter and use letters, numbers, or underscores');
    }
    const json = JSON.stringify(value ?? null);
    if (json.length > 10_000) throw new BadRequestException('Meta value is too large');
    await this.db.query(
      `INSERT INTO content_meta (id, "contentId", "metaKey", "metaValue")
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT ("contentId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
      [newId(), contentId, key, json],
    );
    return this.listMeta(contentId);
  }

  async deleteMeta(contentId: string, key: string, user: JwtPayload) {
    const existing = await this.findOne(contentId);
    this.assertCanEdit(user, existing);
    await this.db.query(
      'DELETE FROM content_meta WHERE "contentId" = $1 AND "metaKey" = $2',
      [contentId, key],
    );
    return this.listMeta(contentId);
  }

  async publishDue() {
    const rows = await this.db.query<{ id: string }>(
      `UPDATE contents
       SET status = 'PUBLISHED',
           "publishedAt" = COALESCE("publishedAt", now()),
           "updatedAt" = now()
       WHERE status = 'SCHEDULED'
         AND "scheduledAt" IS NOT NULL
         AND "scheduledAt" <= now()
       RETURNING id`,
    );
    for (const row of rows) {
      const content = await this.findOne(row.id);
      await this.hooks.doAction('content.published', content);
    }
    return rows.length;
  }

  private async presentPublic(
    content: Awaited<ReturnType<ContentService['hydrate']>>[number],
    unlock?: string,
  ) {
    if (content.status !== 'PUBLISHED' || content.visibility === 'PRIVATE') {
      throw new NotFoundException('Content not found');
    }
    const unlocked =
      content.visibility === 'PASSWORD' &&
      verifyUnlock(this.unlockSecret, unlock, content.slug);
    return this.decoratePublic(redactPasswordContent(content, unlocked));
  }

  /** Public query fields a filter may change. SQL is still built by core. */
  private async shapePublicQuery(query: QueryContentDto): Promise<QueryContentDto> {
    const next = await this.hooks.applyFilters('pre_get_posts', {
      type: query.type,
      search: query.search,
      category: query.category,
      tag: query.tag,
      page: query.page,
      perPage: query.perPage,
    });
    if (!next || typeof next !== 'object') return query;
    const record = next as Record<string, unknown>;
    const text = (key: string, max = 200) => {
      const value = record[key];
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim().slice(0, max);
      return trimmed || undefined;
    };
    const type = text('type', 16);
    return {
      ...query,
      type: type === 'POST' || type === 'PAGE' ? type : query.type,
      search: text('search') ?? query.search,
      category: text('category', 80) ?? query.category,
      tag: text('tag', 80) ?? query.tag,
      page: text('page', 8) ?? query.page,
      perPage: text('perPage', 4) ?? query.perPage,
    };
  }

  private async decoratePublic<T extends { title: string; excerpt: string | null; blocks: unknown }>(view: T) {
    const expanded = await this.registry.expandBlocks(Array.isArray(view.blocks) ? view.blocks : []);
    const filteredRaw = await this.hooks.applyFilters('content.public', { ...view, blocks: expanded });
    const filtered =
      filteredRaw && typeof filteredRaw === 'object'
        ? filteredRaw
        : { ...view, blocks: expanded };
    const title = await this.hooks.applyFilters('the_title', filtered.title, filtered);
    const excerpt = await this.hooks.applyFilters('the_excerpt', filtered.excerpt ?? '', filtered);
    const blocks = await this.hooks.applyFilters('the_content', filtered.blocks, filtered);
    return {
      ...filtered,
      title: typeof title === 'string' ? title : filtered.title,
      excerpt: typeof excerpt === 'string' ? excerpt : filtered.excerpt,
      blocks: Array.isArray(blocks) ? blocks : filtered.blocks,
    };
  }

  private async filterBlocks(blocks: unknown[], user: JwtPayload, id?: string) {
    const filtered = await this.hooks.applyFilters('content.blocks', blocks, {
      id,
      userId: user.sub,
    });
    if (!Array.isArray(filtered)) {
      throw new BadRequestException('content.blocks filter must return an array');
    }
    return filtered;
  }

  private async passwordForWrite(
    visibility: string,
    password: string | undefined,
    _current: string | null,
  ) {
    if (visibility !== 'PASSWORD' || !password) return null;
    return bcrypt.hash(password, 10);
  }

  private async passwordHashOf(id: string) {
    const row = await this.db.one<{ passwordHash: string | null }>(
      'SELECT "passwordHash" FROM contents WHERE id = $1',
      [id],
    );
    return row?.passwordHash ?? null;
  }

  private assertCanCreate(user: JwtPayload, type: string) {
    if (type === 'PAGE') {
      if (!can(user.role, 'edit_pages')) {
        throw new ForbiddenException('Only editors and admins can create pages');
      }
      return;
    }
    if (!can(user.role, 'edit_posts')) {
      throw new ForbiddenException('You cannot create posts');
    }
  }

  private assertCanEdit(user: JwtPayload, existing: { type: string; authorId: string }) {
    if (existing.type === 'PAGE') {
      if (!can(user.role, 'edit_pages')) {
        throw new ForbiddenException('Only editors and admins can edit pages');
      }
      return;
    }
    if (!can(user.role, 'edit_posts')) {
      throw new ForbiddenException('You cannot edit posts');
    }
    if (existing.authorId !== user.sub && !can(user.role, 'edit_others_posts')) {
      throw new ForbiddenException('You can only edit your own content');
    }
  }

  private assertCanDelete(user: JwtPayload, existing: { type: string; authorId: string }) {
    if (existing.type === 'PAGE') {
      if (!can(user.role, 'delete_pages')) {
        throw new ForbiddenException('Only editors and admins can delete pages');
      }
      return;
    }
    if (existing.authorId !== user.sub && !can(user.role, 'delete_others_posts')) {
      throw new ForbiddenException('You can only delete your own content');
    }
    if (!can(user.role, 'delete_posts') && !can(user.role, 'delete_others_posts')) {
      throw new ForbiddenException('You cannot delete posts');
    }
  }

  private assertCanSetStatus(user: JwtPayload, status: string, type: string) {
    if (status === 'PUBLISHED' || status === 'SCHEDULED') {
      if (!can(user.role, publishCapability(type))) {
        throw new ForbiddenException('You do not have permission to publish');
      }
    }
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
    if (publicOnly) {
      add(`c.status = 'PUBLISHED'`);
      add(`c.visibility IN ('PUBLIC', 'PASSWORD')`);
    } else if (query.status) add('c.status = $?::"ContentStatus"', query.status);
    else add(`c.status <> 'TRASHED'`);

    if (query.search) {
      const like = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      const text = query.search.replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim();
      if (text) {
        add(
          `(c.title ILIKE $? ESCAPE '\\' OR c.excerpt ILIKE $? ESCAPE '\\'
            OR to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.excerpt, ''))
               @@ plainto_tsquery('english', $?))`,
          like,
          like,
          text,
        );
      } else {
        add(
          `(c.title ILIKE $? ESCAPE '\\' OR c.excerpt ILIKE $? ESCAPE '\\')`,
          like,
          like,
        );
      }
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
      passwordProtected: row.visibility === 'PASSWORD',
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
