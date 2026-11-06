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
import { publishCapability } from '../auth/capabilities';
import { CapabilitiesService } from '../auth/capabilities.service';
import { validateBlocks } from '../blocks/block-document';
import { buildContentQuery, ContentQueryError, ContentQueryInput } from './content-query';
import { lockIsHeld, lockUntil } from './content-lock';
import { MetaGroup, TaxGroup } from '../query/meta-tax-query';
import { currentSiteId } from '../sites/site-context';
import { JwtPayload } from '../auth/jwt.strategy';
import { Db, DbService } from '../db/db.service';
import { isUndefinedTable, isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { buildPermalink, buildSeoDocument, templateCandidates } from '../cms/publishing';
import { ExtensionRegistry } from '../extensions/extension-registry';
import { HooksService } from '../hooks/hooks.service';
import { ModelingService } from '../modeling/modeling.service';
import { SettingsService } from '../settings/settings.service';
import {
  AutosaveDto,
  CreateContentDto,
  QueryContentDto,
  UpdateContentDto,
} from './content.dto';
import { redactPasswordContent, signUnlock, verifyUnlock } from './visibility';

const CONTENT_COLUMNS = `c.id, c.type, c.status, c.visibility, c.sticky, c."commentStatus",
  c.title, c.slug, c.excerpt, c.blocks, c.seo, c."postType", c.locale, c."translationGroup",
  c."coverImage", c."publishedAt", c."scheduledAt", c."authorId", c."createdAt", c."updatedAt"`;

const META_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

type Author = { id: string; name: string; avatarUrl: string | null };

type ContentRow = {
  id: string;
  type: string;
  postType: string;
  locale: string;
  translationGroup: string | null;
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
    private settings: SettingsService,
    private modeling: ModelingService,
    private caps: CapabilitiesService,
    config: ConfigService,
  ) {
    this.unlockSecret = config.get<string>('JWT_SECRET') ?? 'openpress-dev-secret';
  }

  async findAll(query: QueryContentDto, publicOnly = false) {
    const shaped = publicOnly ? await this.shapePublicQuery(query) : query;
    const filtered = await this.hooks.applyFilters('content.query', this.toQueryInput(shaped, publicOnly));
    const request = filtered && typeof filtered === 'object' ? (filtered as ContentQueryInput) : this.toQueryInput(shaped, publicOnly);
    if (publicOnly) request.publicOnly = true;
    request.siteId = currentSiteId();
    let built;
    try {
      built = buildContentQuery(request);
    } catch (error) {
      if (error instanceof ContentQueryError) throw new BadRequestException(error.message);
      throw error;
    }
    const { where, params, order, page, perPage } = built;
    const limit = params.length + 1;
    const offset = params.length + 2;
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
    return { ...content, meta: await this.listMeta(id), lock: await this.currentLock(id) };
  }

  async acquireLock(id: string, user: JwtPayload) {
    const existing = await this.findRow('id', id);
    if (!existing) throw new NotFoundException('Content not found');
    await this.assertCanEdit(user, existing);
    const now = new Date();
    const held = await this.currentLock(id);
    if (lockIsHeld(held, user.sub, now) && !await this.caps.allows(user.sub, 'edit_others_posts')) {
      throw new ConflictException('Someone else is editing this');
    }
    const expiresAt = lockUntil(now);
    await this.db.query(
      `INSERT INTO content_locks ("contentId", "userId", "expiresAt")
       VALUES ($1, $2, $3)
       ON CONFLICT ("contentId") DO UPDATE SET "userId" = EXCLUDED."userId", "expiresAt" = EXCLUDED."expiresAt"`,
      [id, user.sub, expiresAt],
    );
    return { userId: user.sub, expiresAt };
  }

  async releaseLock(id: string, user: JwtPayload) {
    const existing = await this.findRow('id', id);
    if (!existing) throw new NotFoundException('Content not found');
    await this.assertCanEdit(user, existing);
    await this.db.query(
      `DELETE FROM content_locks WHERE "contentId" = $1 AND ("userId" = $2 OR $3::boolean)`,
      [id, user.sub, await this.caps.allows(user.sub, 'edit_others_posts')],
    );
    return { released: true };
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
    const resolved = await this.resolvedPostType(dto.type ?? 'POST', dto.postType);
    const type = resolved.type;
    await this.assertCanCreate(user, type);
    const status = dto.status ?? 'DRAFT';
    await this.assertCanSetStatus(user, status, type);
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
             id, type, "postType", locale, "translationGroup", status, visibility, sticky, "commentStatus", title, slug, excerpt,
             blocks, seo, "coverImage", "passwordHash", "publishedAt", "scheduledAt",
             "authorId", "updatedAt", "siteId"
           ) VALUES (
             $1, $2::"ContentType", $3, $4, $5, $6::"ContentStatus", $7, $8, $9, $10, $11, $12,
             $13::jsonb, $14::jsonb, $15, $16, $17, $18, $19, now(), $20
           )`,
          [
            id,
            type,
            resolved.postType,
            (dto.locale || 'en').toLowerCase(),
            dto.translationGroup ?? null,
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
            currentSiteId(),
          ],
        );
        await this.linkTerms(sql, id, dto.categoryIds, dto.tagIds, false);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Slug already in use');
      throw error;
    }
    if (dto.termIds) await this.modeling.replaceContentTerms(id, dto.termIds);
    await this.writeFields(id, dto.fields);
    const content = await this.findOne(id);
    await this.hooks.doAction('content.created', content);
    if (status === 'PUBLISHED') await this.hooks.doAction('content.published', content);
    return content;
  }

  async update(id: string, dto: UpdateContentDto, user: JwtPayload) {
    const existing = await this.findOne(id);
    await this.assertCanEdit(user, existing);
    if (dto.type === 'PAGE' || existing.type === 'PAGE') {
      if (!await this.caps.allows(user.sub, 'edit_pages')) {
        throw new ForbiddenException('Only editors and admins can edit pages');
      }
    }
    const nextStatus = dto.status ?? existing.status;
    if (dto.status) await this.assertCanSetStatus(user, dto.status, dto.type ?? existing.type);
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
        if (dto.postType != null) add('"postType"', (await this.resolvedPostType(dto.type ?? existing.type, dto.postType)).postType);
        if (dto.locale != null) add('locale', dto.locale.toLowerCase());
        if (dto.translationGroup !== undefined) add('"translationGroup"', dto.translationGroup || null);
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
    if (dto.termIds) await this.modeling.replaceContentTerms(id, dto.termIds);
    await this.writeFields(id, dto.fields);

    const content = await this.findOne(id);
    await this.hooks.doAction('content.updated', content);
    if (becomingPublished) await this.hooks.doAction('content.published', content);
    return content;
  }

  async remove(id: string, user: JwtPayload) {
    const existing = await this.findOne(id);
    await this.assertCanDelete(user, existing);
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
    await this.assertCanEdit(user, existing);
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
    await this.assertCanEdit(user, existing);
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
    await this.assertCanEdit(user, existing);
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
    await this.assertCanEdit(user, existing);
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

  async purgeStale() {
    const trashed = await this.db.query(
      `DELETE FROM contents WHERE status = 'TRASHED' AND "updatedAt" < now() - interval '30 days' RETURNING id`,
    );
    const autosaves = await this.db.query(
      `DELETE FROM autosaves WHERE "updatedAt" < now() - interval '7 days' RETURNING id`,
    );
    return { trashed: trashed.length, autosaves: autosaves.length };
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
    const withPatterns = await this.modeling.expandSyncedPatterns(Array.isArray(view.blocks) ? view.blocks : []);
    const expanded = await this.registry.expandBlocks(withPatterns);
    const filteredRaw = await this.hooks.applyFilters('content.public', { ...view, blocks: expanded });
    const filtered =
      filteredRaw && typeof filteredRaw === 'object'
        ? filteredRaw
        : { ...view, blocks: expanded };
    const title = await this.hooks.applyFilters('the_title', filtered.title, filtered);
    const excerpt = await this.hooks.applyFilters('the_excerpt', filtered.excerpt ?? '', filtered);
    const blocks = await this.hooks.applyFilters('the_content', filtered.blocks, filtered);
    const viewOut = {
      ...filtered,
      title: typeof title === 'string' ? title : filtered.title,
      excerpt: typeof excerpt === 'string' ? excerpt : filtered.excerpt,
      blocks: Array.isArray(blocks) ? blocks : filtered.blocks,
    };
    return { ...viewOut, seoHead: await this.seoHead(viewOut) };
  }

  private async filterBlocks(blocks: unknown[], user: JwtPayload, id?: string) {
    const filtered = await this.hooks.applyFilters('content.blocks', blocks, {
      id,
      userId: user.sub,
    });
    if (!Array.isArray(filtered)) {
      throw new BadRequestException('content.blocks filter must return an array');
    }
    const extra = this.registry.blocksForEditor().map((block) => block.name);
    const validated = validateBlocks(filtered, extra);
    if (!validated.ok) throw new BadRequestException(validated.errors[0] ?? 'Invalid blocks');
    return validated.blocks;
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

  async createTranslation(id: string, locale: string, user: JwtPayload) {
    const existing = await this.findOne(id);
    await this.assertCanEdit(user, existing);
    const normalized = locale.trim().toLowerCase();
    if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(normalized)) {
      throw new BadRequestException('Locale looks like en or en-gb');
    }
    const group = existing.translationGroup || newId();
    if (!existing.translationGroup) {
      await this.db.query('UPDATE contents SET "translationGroup" = $2 WHERE id = $1', [id, group]);
    }
    const duplicate = (existing.translations ?? []).find((item) => item.locale === normalized);
    if (duplicate) return this.findOne(duplicate.id);
    return this.create(
      {
        title: `${existing.title}`,
        type: existing.type === 'PAGE' ? 'PAGE' : 'POST',
        postType: existing.postType,
        locale: normalized,
        translationGroup: group,
        status: 'DRAFT',
        excerpt: existing.excerpt ?? undefined,
        blocks: existing.blocks,
      },
      user,
    );
  }

  private async resolvedPostType(type: string, requested?: string) {
    const postType = (requested || (type === 'PAGE' ? 'page' : 'post')).trim().toLowerCase();
    if (postType === 'page') return { type: 'PAGE' as const, postType };
    if (postType === 'post') return { type: 'POST' as const, postType };
    const row = await this.db.one('SELECT slug FROM post_types WHERE slug = $1', [postType]);
    if (!row) throw new BadRequestException('Unknown post type');
    return { type: 'POST' as const, postType };
  }

  private async writeFields(contentId: string, fields?: Record<string, unknown>) {
    if (!fields) return;
    for (const [key, value] of Object.entries(fields)) {
      if (!META_KEY.test(key)) throw new BadRequestException(`Invalid field key ${key}`);
      const json = JSON.stringify(value ?? null);
      if (json.length > 10_000) throw new BadRequestException('Field value is too large');
      await this.db.query(
        `INSERT INTO content_meta (id, "contentId", "metaKey", "metaValue")
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT ("contentId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
        [newId(), contentId, key, json],
      );
    }
  }

  private async seoHead(view: {
    title: string;
    excerpt?: string | null;
    slug?: string;
    permalink?: string;
    type?: string;
    coverImage?: string | null;
    publishedAt?: Date | string | null;
    seo?: unknown;
    author?: { name?: string };
    translations?: { locale: string; permalink: string }[];
  }) {
    const settings = await this.settings.getAll();
    const siteUrl = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
    return buildSeoDocument({
      siteTitle: String(settings.siteTitle ?? 'OpenPress'),
      siteDescription: String(settings.siteDescription ?? ''),
      siteUrl,
      blogPublic: settings.blogPublic !== false,
      defaultOgImage: typeof settings.defaultOgImage === 'string' ? settings.defaultOgImage : '',
      twitterSite: typeof settings.twitterSite === 'string' ? settings.twitterSite : '',
      title: view.title,
      description: view.excerpt,
      permalink: view.permalink || `/${view.slug ?? ''}`,
      type: view.type || 'POST',
      coverImage: view.coverImage,
      publishedAt: view.publishedAt,
      authorName: view.author?.name,
      seo: view.seo && typeof view.seo === 'object' ? (view.seo as Record<string, unknown>) : {},
      alternates: view.translations,
    });
  }

  private async assertCanCreate(user: JwtPayload, type: string) {
    if (type === 'PAGE') {
      if (!await this.caps.allows(user.sub, 'edit_pages')) {
        throw new ForbiddenException('Only editors and admins can create pages');
      }
      return;
    }
    if (!await this.caps.allows(user.sub, 'edit_posts')) {
      throw new ForbiddenException('You cannot create posts');
    }
  }

  private async assertCanEdit(user: JwtPayload, existing: { type: string; authorId: string }) {
    if (existing.type === 'PAGE') {
      if (!await this.caps.allows(user.sub, 'edit_pages')) {
        throw new ForbiddenException('Only editors and admins can edit pages');
      }
      return;
    }
    if (!await this.caps.allows(user.sub, 'edit_posts')) {
      throw new ForbiddenException('You cannot edit posts');
    }
    if (existing.authorId !== user.sub && !await this.caps.allows(user.sub, 'edit_others_posts')) {
      throw new ForbiddenException('You can only edit your own content');
    }
  }

  private async assertCanDelete(user: JwtPayload, existing: { type: string; authorId: string }) {
    if (existing.type === 'PAGE') {
      if (!await this.caps.allows(user.sub, 'delete_pages')) {
        throw new ForbiddenException('Only editors and admins can delete pages');
      }
      return;
    }
    if (existing.authorId !== user.sub && !await this.caps.allows(user.sub, 'delete_others_posts')) {
      throw new ForbiddenException('You can only delete your own content');
    }
    if (!await this.caps.allows(user.sub, 'delete_posts') && !await this.caps.allows(user.sub, 'delete_others_posts')) {
      throw new ForbiddenException('You cannot delete posts');
    }
  }

  private async assertCanSetStatus(user: JwtPayload, status: string, type: string) {
    if (status === 'PUBLISHED' || status === 'SCHEDULED') {
      if (!await this.caps.allows(user.sub, publishCapability(type))) {
        throw new ForbiddenException('You do not have permission to publish');
      }
    }
  }

  private toQueryInput(query: QueryContentDto, publicOnly: boolean): ContentQueryInput {
    const meta = query.metaKey
      ? [{
          key: query.metaKey,
          value: parseMetaValue(query.metaValue),
          compare: query.metaCompare ?? (query.metaValue === undefined ? 'exists' : 'eq'),
        }]
      : [];
    return {
      type: query.type,
      postType: query.postType,
      constrainBuiltinPosts: !query.postType && query.type === 'POST',
      locale: query.locale,
      status: query.status,
      visibility: query.visibility,
      authorId: query.authorId,
      search: query.search,
      category: query.category,
      tag: query.tag,
      after: query.after,
      before: query.before,
      orderBy: query.orderBy as ContentQueryInput['orderBy'],
      order: query.order === 'ASC' ? 'ASC' : query.order === 'DESC' ? 'DESC' : undefined,
      sticky: query.sticky === 'only' || query.sticky === 'exclude' ? query.sticky : undefined,
      publicOnly,
      page: query.page,
      perPage: query.perPage,
      siteId: currentSiteId(),
      meta: query.metaQuery ? parseQueryJson<MetaClauseList>(query.metaQuery, 'meta') : meta,
      tax: query.taxQuery ? parseQueryJson<TaxGroup>(query.taxQuery, 'tax') : undefined,
    };
  }

  private async currentLock(id: string) {
    try {
      const row = await this.db.one<{ userId: string; expiresAt: Date; name: string }>(
        `SELECT l."userId", l."expiresAt", u.name
         FROM content_locks l JOIN users u ON u.id = l."userId"
         WHERE l."contentId" = $1 AND l."expiresAt" > now()`,
        [id],
      );
      return row ?? null;
    } catch (error) {
      if (isUndefinedTable(error)) return null;
      throw error;
    }
  }

  private async findRow(column: 'id' | 'slug', value: string) {
    const row = await this.db.one<ContentRow>(
      `SELECT ${CONTENT_COLUMNS},
              json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl") AS author
       FROM contents c
       JOIN users u ON u.id = c."authorId"
       WHERE c."${column}" = $1 AND c."siteId" = $2`,
      [value, currentSiteId()],
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
    const settings = await this.settings.getAll();
    const structure = String(settings.permalinkStructure ?? '/%postname%/');
    const groups = rows.map((row) => row.translationGroup).filter((group): group is string => Boolean(group));
    const translations = groups.length
      ? await this.db.query<{ id: string; slug: string; locale: string; translationGroup: string; publishedAt: Date | null; postType: string }>(
          `SELECT id, slug, locale, "translationGroup", "publishedAt", "postType"
           FROM contents WHERE "translationGroup" = ANY($1::text[])`,
          [groups],
        )
      : [];
    const customTerms = await this.db.query<{ contentId: string; id: string; taxonomy: string; name: string; slug: string }>(
      `SELECT ct."contentId", t.id, t.taxonomy, t.name, t.slug
       FROM content_terms ct
       JOIN terms t ON t.id = ct."termId"
       WHERE ct."contentId" = ANY($1::text[])`,
      [ids],
    );

    return rows.map((row) => {
      const rowCategories = categoriesByContent.get(row.id) ?? [];
      const authorName = row.author?.name;
      const permalink = buildPermalink(structure, {
        slug: row.slug,
        publishedAt: row.publishedAt,
        category: rowCategories[0]?.slug,
        author: authorName ? slugify(authorName, { lower: true, strict: true }) : null,
      });
      const siblings = translations
        .filter((item) => item.translationGroup === row.translationGroup)
        .map((item) => ({
          id: item.id,
          locale: item.locale,
          slug: item.slug,
          permalink: buildPermalink(structure, { slug: item.slug, publishedAt: item.publishedAt }),
        }));
      return {
        ...row,
        passwordProtected: row.visibility === 'PASSWORD',
        categories: rowCategories,
        tags: tagsByContent.get(row.id) ?? [],
        terms: customTerms.filter((term) => term.contentId === row.id),
        translations: siblings,
        permalink,
        templates: templateCandidates({ kind: 'single', postType: row.postType, slug: row.slug }),
        _count: { comments: countsByContent.get(row.id) ?? 0 },
      };
    });
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
        'SELECT id FROM contents WHERE slug = $1 AND "siteId" = $2',
        [slug, currentSiteId()],
      );
      if (!clash || clash.id === excludeId) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
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

type MetaClauseList = ContentQueryInput['meta'];

function parseQueryJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new BadRequestException(`Invalid ${label} query`);
  }
}

function parseMetaValue(value: string | undefined) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}
