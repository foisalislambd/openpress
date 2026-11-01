import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import slugify from 'slugify';
import { DbService } from '../db/db.service';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { JwtPayload } from '../auth/jwt.strategy';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildWxr, parseWxrBundle, WxrBundle, WxrItem } from '../feeds/wxr';
import { isPublicHostname } from '../extensions/sandbox/plugin-sandbox';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class ToolsService {
  constructor(
    private db: DbService,
    private settings: SettingsService,
  ) {}

  async exportWxr() {
    const settings = await this.settings.getAll();
    const rows = await this.db.query<{
      id: string;
      type: 'POST' | 'PAGE';
      status: WxrItem['status'];
      visibility: WxrItem['visibility'];
      title: string;
      slug: string;
      excerpt: string | null;
      blocks: unknown;
      sticky: boolean;
    }>(
      `SELECT id, type, status, visibility, title, slug, excerpt, blocks, sticky
       FROM contents
       ORDER BY "createdAt" ASC`,
    );
    const ids = rows.map((row) => row.id);
    const [categories, tags] = ids.length
      ? await Promise.all([
          this.db.query<{ contentId: string; slug: string; name: string }>(
            `SELECT cc."B" AS "contentId", cat.slug, cat.name
             FROM categories cat
             JOIN "_ContentCategories" cc ON cc."A" = cat.id
             WHERE cc."B" = ANY($1::text[])`,
            [ids],
          ),
          this.db.query<{ contentId: string; slug: string; name: string }>(
            `SELECT ct."A" AS "contentId", tag.slug, tag.name
             FROM tags tag
             JOIN "_ContentTags" ct ON ct."B" = tag.id
             WHERE ct."A" = ANY($1::text[])`,
            [ids],
          ),
        ])
      : [[], []];
    const items: WxrItem[] = rows.map((row) => ({
      title: row.title,
      slug: row.slug,
      type: row.type,
      status: row.status,
      visibility: row.visibility,
      excerpt: row.excerpt ?? '',
      blocks: Array.isArray(row.blocks) ? row.blocks : [],
      categories: categories
        .filter((term) => term.contentId === row.id)
        .map(({ slug, name }) => ({ slug, name })),
      tags: tags.filter((term) => term.contentId === row.id).map(({ slug, name }) => ({ slug, name })),
      sticky: row.sticky,
    }));
    const siteUrl = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    return buildWxr({
      siteTitle: String(settings.siteTitle ?? 'OpenPress'),
      siteUrl,
      items,
    });
  }

  async importWxr(xml: string, user: JwtPayload) {
    let bundle: WxrBundle;
    try {
      bundle = parseWxrBundle(xml);
    } catch {
      throw new BadRequestException('Could not read that WXR file');
    }
    if (bundle.items.length === 0 && bundle.attachments.length === 0) {
      throw new BadRequestException('No posts, pages, or attachments were found in that file');
    }
    const jobId = newId();
    const total = bundle.items.length + bundle.attachments.length + bundle.menuItems.length;
    await this.db.query(
      `INSERT INTO jobs (id, type, status, progress, total, message) VALUES ($1, 'wxr', 'QUEUED', 0, $2, 'Waiting')`,
      [jobId, total],
    );
    void this.runWxrImport(jobId, bundle, user).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Import failed';
      await this.db.query(
        `UPDATE jobs SET status = 'FAILED', message = $2, "updatedAt" = now() WHERE id = $1`,
        [jobId, message],
      );
    });
    return { jobId, total };
  }

  async job(id: string) {
    const row = await this.db.one(
      'SELECT id, type, status, progress, total, message, result, "updatedAt" FROM jobs WHERE id = $1',
      [id],
    );
    if (!row) throw new BadRequestException('Import job not found');
    return row;
  }

  private async runWxrImport(jobId: string, bundle: WxrBundle, user: JwtPayload) {
    await this.db.query(`UPDATE jobs SET status = 'RUNNING', "updatedAt" = now() WHERE id = $1`, [jobId]);
    const mediaByWpId = new Map<string, string>();
    let progress = 0;
    let imported = 0;
    const notes: string[] = [];
    for (const attachment of bundle.attachments) {
      progress += 1;
      try {
        const url = await this.downloadAttachment(attachment.url, attachment.filename, user.sub);
        if (attachment.wpId) mediaByWpId.set(attachment.wpId, url);
        imported += 1;
      } catch (error) {
        notes.push(`Attachment ${attachment.title}: ${error instanceof Error ? error.message : 'skipped'}`);
      }
      await this.touchJob(jobId, progress, notes.at(-1) ?? 'Attachments');
    }
    for (const item of bundle.items) {
      progress += 1;
      const authorId = item.author ? await this.ensureAuthor(item.author) : user.sub;
      const cover = item.featuredId ? mediaByWpId.get(item.featuredId) ?? null : null;
      const existing = item.wpId ? await this.findImported(item.wpId) : null;
      const id = existing ?? newId();
      const passwordHash = item.password ? await bcrypt.hash(item.password, 10) : null;
      const when = item.date ? new Date(item.date.replace(' ', 'T')) : null;
      const scheduledAt = item.status === 'SCHEDULED' && when && !Number.isNaN(when.getTime()) ? when : null;
      const publishedAt = item.status === 'PUBLISHED' ? (when && !Number.isNaN(when.getTime()) ? when : new Date()) : null;
      const slug = existing ? undefined : await this.uniqueSlug(item.slug || item.title);
      try {
        if (existing) {
          await this.db.query(
            `UPDATE contents
             SET status = $2::"ContentStatus", visibility = $3, title = $4, excerpt = $5,
                 blocks = $6::jsonb, sticky = $7, "passwordHash" = COALESCE($8, "passwordHash"),
                 "publishedAt" = COALESCE($9, "publishedAt"), "scheduledAt" = $10,
                 "coverImage" = COALESCE($11, "coverImage"), "updatedAt" = now()
             WHERE id = $1`,
            [existing, item.status, item.visibility, item.title, item.excerpt || null, JSON.stringify(item.blocks ?? []), item.sticky ?? false, passwordHash, publishedAt, scheduledAt, cover],
          );
        } else {
          await this.db.query(
            `INSERT INTO contents (
               id, type, status, visibility, title, slug, excerpt, blocks, seo,
               sticky, "commentStatus", "passwordHash", "publishedAt", "scheduledAt", "coverImage", "authorId", "updatedAt"
             ) VALUES (
               $1, $2::"ContentType", $3::"ContentStatus", $4, $5, $6, $7, $8::jsonb, '{}'::jsonb,
               $9, 'open', $10, $11, $12, $13, $14, now()
             )`,
            [id, item.type, item.status, item.visibility, item.title, slug, item.excerpt || null, JSON.stringify(item.blocks ?? []), item.sticky ?? false, passwordHash, publishedAt, scheduledAt, cover, authorId],
          );
        }
        const categoryIds = await this.ensureTerms('categories', item.categories);
        const tagIds = item.type === 'POST' ? await this.ensureTerms('tags', item.tags) : [];
        await this.linkTerms(id, categoryIds, tagIds);
        if (item.wpId) {
          await this.db.query(
            `INSERT INTO content_meta (id, "contentId", "metaKey", "metaValue")
             VALUES ($1, $2, 'wxrId', $3::jsonb)
             ON CONFLICT ("contentId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
            [newId(), id, JSON.stringify(item.wpId)],
          );
        }
        for (const meta of item.meta ?? []) {
          if (!meta.key || meta.key.startsWith('_')) continue;
          await this.db.query(
            `INSERT INTO content_meta (id, "contentId", "metaKey", "metaValue")
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT ("contentId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
            [newId(), id, meta.key.slice(0, 80), JSON.stringify(meta.value.slice(0, 5000))],
          );
        }
        for (const comment of item.comments ?? []) {
          if (!comment.content) continue;
          await this.db.query(
            `INSERT INTO comments (id, "contentId", "guestName", "guestEmail", body, status)
             SELECT $1, $2, $3, $4, $5, $6::"CommentStatus"
             WHERE NOT EXISTS (
               SELECT 1 FROM comments WHERE "contentId" = $2 AND body = $5 AND COALESCE("guestEmail", '') = $4
             )`,
            [newId(), id, comment.author || 'Imported', comment.email || '', comment.content.slice(0, 10000), comment.approved ? 'APPROVED' : 'PENDING'],
          );
        }
        if (item.link) {
          const from = safePath(item.link);
          if (from && from !== `/${slug ?? item.slug}`) {
            await this.db.query(
              `INSERT INTO redirects (id, "fromPath", "toPath", "statusCode")
               VALUES ($1, $2, $3, 301)
               ON CONFLICT ("fromPath") DO NOTHING`,
              [newId(), from, `/${existing ? item.slug : slug}`],
            );
          }
        }
        imported += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        notes.push(`Skipped duplicate slug for ${item.title}`);
      }
      await this.touchJob(jobId, progress, item.title);
    }
    if (bundle.menuItems.length) {
      const settings = await this.settings.getAll();
      const menus = Array.isArray(settings.menus) ? settings.menus : [];
      const items = bundle.menuItems
        .sort((a, b) => a.order - b.order)
        .map((item) => ({ label: item.title, url: item.url }));
      await this.settings.updateMany({
        menus: [{ name: 'Imported', items }],
        menuLocations: { ...(settings.menuLocations as object), primary: 'Imported' },
      });
    }
    await this.db.query(
      `UPDATE jobs SET status = 'DONE', progress = total, message = $2, result = $3::jsonb, "updatedAt" = now() WHERE id = $1`,
      [jobId, `Imported ${imported}`, JSON.stringify({ imported, notes })],
    );
  }

  private async touchJob(id: string, progress: number, message: string) {
    await this.db.query(`UPDATE jobs SET progress = $2, message = $3, "updatedAt" = now() WHERE id = $1`, [
      id,
      progress,
      message.slice(0, 200),
    ]);
  }

  private async downloadAttachment(url: string, filename: string, uploaderId: string) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !isPublicHostname(parsed.hostname)) {
      throw new Error('refused non-public URL');
    }
    const response = await fetch(parsed, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 15_000_000) throw new Error('larger than 15MB');
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80) || 'file';
    const stored = `${Date.now()}-${safe}`;
    const dir = process.env.UPLOAD_DIR ?? 'uploads';
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, stored), bytes);
    const id = newId();
    const publicUrl = `/uploads/${stored}`;
    await this.db.query(
      `INSERT INTO media (id, filename, url, "mimeType", size, "uploaderId")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, safe, publicUrl, response.headers.get('content-type') || 'application/octet-stream', bytes.length, uploaderId],
    );
    return publicUrl;
  }

  private async ensureAuthor(name: string) {
    const slug = slugify(name, { lower: true, strict: true }) || 'author';
    const email = `wxr-${slug}@import.openpress.local`;
    const existing = await this.db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return existing.id;
    const id = newId();
    await this.db.query(
      `INSERT INTO users (id, email, name, role, "passwordHash", "updatedAt")
       VALUES ($1, $2, $3, 'AUTHOR', $4, now())`,
      [id, email, name.slice(0, 80), await bcrypt.hash(newId(), 10)],
    );
    return id;
  }

  private async findImported(wpId: string) {
    const row = await this.db.one<{ contentId: string }>(
      `SELECT "contentId" FROM content_meta WHERE "metaKey" = 'wxrId' AND "metaValue" = $1::jsonb`,
      [JSON.stringify(wpId)],
    );
    return row?.contentId ?? null;
  }

  private async linkTerms(contentId: string, categoryIds: string[], tagIds: string[]) {
    if (categoryIds.length) {
      await this.db.query('DELETE FROM "_ContentCategories" WHERE "B" = $1', [contentId]);
      await this.db.query(
        `INSERT INTO "_ContentCategories" ("A", "B")
         SELECT category_id, $1 FROM unnest($2::text[]) AS category_id
         ON CONFLICT DO NOTHING`,
        [contentId, categoryIds],
      );
    }
    if (tagIds.length) {
      await this.db.query('DELETE FROM "_ContentTags" WHERE "A" = $1', [contentId]);
      await this.db.query(
        `INSERT INTO "_ContentTags" ("A", "B")
         SELECT $1, tag_id FROM unnest($2::text[]) AS tag_id
         ON CONFLICT DO NOTHING`,
        [contentId, tagIds],
      );
    }
  }

  private async ensureTerms(table: 'categories' | 'tags', terms: { slug: string; name: string }[]) {
    const ids: string[] = [];
    for (const term of terms) {
      const slug = slugify(term.slug || term.name, { lower: true, strict: true });
      if (!slug) continue;
      const existing = await this.db.one<{ id: string }>(
        `SELECT id FROM ${table} WHERE slug = $1`,
        [slug],
      );
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const created = await this.db.one<{ id: string }>(
        table === 'categories'
          ? `INSERT INTO categories (id, name, slug) VALUES ($1, $2, $3) RETURNING id`
          : `INSERT INTO tags (id, name, slug) VALUES ($1, $2, $3) RETURNING id`,
        [newId(), term.name || slug, slug],
      );
      if (created) ids.push(created.id);
    }
    return ids;
  }

  private async uniqueSlug(source: string) {
    const base = slugify(source, { lower: true, strict: true }) || 'untitled';
    let slug = base;
    let i = 1;
    for (;;) {
      const clash = await this.db.one<{ id: string }>('SELECT id FROM contents WHERE slug = $1', [slug]);
      if (!clash) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
}

function safePath(link: string) {
  try {
    const path = link.startsWith('http') ? new URL(link).pathname : link;
    if (!path.startsWith('/') || path.includes('..')) return '';
    return path.replace(/\/$/, '') || '/';
  } catch {
    return '';
  }
}
