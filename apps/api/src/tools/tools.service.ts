import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import slugify from 'slugify';
import { DbService } from '../db/db.service';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { JwtPayload } from '../auth/jwt.strategy';
import { buildWxr, parseWxr, WxrItem } from '../feeds/wxr';
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
    let items: WxrItem[];
    try {
      items = parseWxr(xml);
    } catch {
      throw new BadRequestException('Could not read that WXR file');
    }
    if (items.length === 0) {
      throw new BadRequestException('No posts or pages were found in that file');
    }
    let imported = 0;
    for (const item of items) {
      const categoryIds = await this.ensureTerms('categories', item.categories);
      const tagIds = item.type === 'POST' ? await this.ensureTerms('tags', item.tags) : [];
      const slug = await this.uniqueSlug(item.slug || item.title);
      const id = newId();
      const passwordHash = item.password ? await bcrypt.hash(item.password, 10) : null;
      try {
        await this.db.tx(async (sql) => {
          await sql.query(
            `INSERT INTO contents (
               id, type, status, visibility, title, slug, excerpt, blocks, seo,
               sticky, "commentStatus", "passwordHash", "publishedAt", "authorId", "updatedAt"
             ) VALUES (
               $1, $2::"ContentType", $3::"ContentStatus", $4, $5, $6, $7, $8::jsonb, '{}'::jsonb,
               $9, 'open', $10, $11, $12, now()
             )`,
            [
              id,
              item.type,
              item.status === 'SCHEDULED' ? 'DRAFT' : item.status,
              item.visibility,
              item.title,
              slug,
              item.excerpt || null,
              JSON.stringify(item.blocks ?? []),
              item.sticky ?? false,
              passwordHash,
              item.status === 'PUBLISHED' ? new Date() : null,
              user.sub,
            ],
          );
          if (categoryIds.length) {
            await sql.query(
              `INSERT INTO "_ContentCategories" ("A", "B")
               SELECT category_id, $1 FROM unnest($2::text[]) AS category_id`,
              [id, categoryIds],
            );
          }
          if (tagIds.length) {
            await sql.query(
              `INSERT INTO "_ContentTags" ("A", "B")
               SELECT $1, tag_id FROM unnest($2::text[]) AS tag_id`,
              [id, tagIds],
            );
          }
        });
        imported += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return { imported, total: items.length };
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
