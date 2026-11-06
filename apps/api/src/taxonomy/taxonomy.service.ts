import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import slugify from 'slugify';
import { DbService } from '../db/db.service';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { currentSiteId } from '../sites/site-context';

type TermRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  createdAt: Date;
  contentCount: number;
};

function presentTerm(row: TermRow) {
  const { contentCount, ...term } = row;
  return { ...term, _count: { contents: contentCount } };
}

@Injectable()
export class TaxonomyService {
  constructor(private db: DbService) {}

  async categories() {
    const rows = await this.db.query<TermRow>(
      `SELECT c.id, c.name, c.slug, c.description, c."parentId", c."createdAt",
              (SELECT count(*)::int FROM "_ContentCategories" cc WHERE cc."A" = c.id) AS "contentCount"
       FROM categories c
       WHERE c."siteId" = $1
       ORDER BY c.name ASC`,
      [currentSiteId()],
    );
    return rows.map(presentTerm);
  }

  async createCategory(name: string, description?: string, parentId?: string) {
    if (parentId) {
      const parent = await this.db.one<{ id: string }>(
        'SELECT id FROM categories WHERE id = $1',
        [parentId],
      );
      if (!parent) throw new BadRequestException('Parent category was not found');
    }
    try {
      return await this.db.one(
        `INSERT INTO categories (id, name, slug, description, "parentId", "siteId")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, slug, description, "parentId", "createdAt"`,
        [
          newId(),
          name,
          await this.uniqueSlug('category', name),
          description ?? null,
          parentId || null,
          currentSiteId(),
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A category with this slug already exists');
      }
      throw error;
    }
  }

  async updateCategory(
    id: string,
    input: { name?: string; slug?: string; description?: string; parentId?: string | null },
  ) {
    if (input.parentId && input.parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (input.name !== undefined) add('name', input.name);
    if (input.slug !== undefined || input.name !== undefined) {
      add('slug', await this.uniqueSlug('category', input.slug || input.name || 'term', id));
    }
    if (input.description !== undefined) add('description', input.description);
    if (input.parentId !== undefined) add('"parentId"', input.parentId || null);
    if (sets.length === 0) {
      const current = await this.db.one(
        `SELECT id, name, slug, description, "parentId", "createdAt"
         FROM categories WHERE id = $1`,
        [id],
      );
      if (!current) throw new NotFoundException('Category not found');
      return current;
    }
    params.push(id, currentSiteId());
    try {
      const row = await this.db.one(
        `UPDATE categories SET ${sets.join(', ')}
         WHERE id = $${params.length - 1} AND "siteId" = $${params.length}
         RETURNING id, name, slug, description, "parentId", "createdAt"`,
        params,
      );
      if (!row) throw new NotFoundException('Category not found');
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A category with this slug already exists');
      }
      throw error;
    }
  }

  async removeCategory(id: string) {
    const row = await this.db.one<{ id: string }>(
      'DELETE FROM categories WHERE id = $1 AND "siteId" = $2 RETURNING id',
      [id, currentSiteId()],
    );
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  async tags() {
    const rows = await this.db.query<TermRow>(
      `SELECT t.id, t.name, t.slug, t."createdAt",
              (SELECT count(*)::int FROM "_ContentTags" ct WHERE ct."B" = t.id) AS "contentCount"
       FROM tags t
       WHERE t."siteId" = $1
       ORDER BY t.name ASC`,
      [currentSiteId()],
    );
    return rows.map(presentTerm);
  }

  async createTag(name: string) {
    try {
      return await this.db.one(
        `INSERT INTO tags (id, name, slug, "siteId")
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug, "createdAt"`,
        [newId(), name, await this.uniqueSlug('tag', name), currentSiteId()],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A tag with this slug already exists');
      }
      throw error;
    }
  }

  async updateTag(id: string, name?: string, slug?: string) {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (name !== undefined) add('name', name);
    if (slug !== undefined || name !== undefined) {
      add('slug', await this.uniqueSlug('tag', slug || name || 'term', id));
    }
    if (sets.length === 0) throw new BadRequestException('Nothing to update');
    params.push(id, currentSiteId());
    try {
      const row = await this.db.one(
        `UPDATE tags SET ${sets.join(', ')}
         WHERE id = $${params.length - 1} AND "siteId" = $${params.length}
         RETURNING id, name, slug, "createdAt"`,
        params,
      );
      if (!row) throw new NotFoundException('Tag not found');
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A tag with this slug already exists');
      throw error;
    }
  }

  async removeTag(id: string) {
    const row = await this.db.one<{ id: string }>(
      'DELETE FROM tags WHERE id = $1 AND "siteId" = $2 RETURNING id',
      [id, currentSiteId()],
    );
    if (!row) throw new NotFoundException('Tag not found');
    return row;
  }

  listTermMeta(kind: 'category' | 'tag' | 'term', termId: string) {
    return this.db.query(
      `SELECT "metaKey", "metaValue" FROM term_meta WHERE "termKind" = $1 AND "termId" = $2 ORDER BY "metaKey"`,
      [kind, termId],
    );
  }

  async upsertTermMeta(kind: 'category' | 'tag' | 'term', termId: string, key: string, value: unknown) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) throw new BadRequestException('Invalid meta key');
    await this.db.query(
      `INSERT INTO term_meta (id, "termKind", "termId", "metaKey", "metaValue")
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT ("termKind", "termId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
      [newId(), kind, termId, key, JSON.stringify(value ?? null)],
    );
    return { key, value };
  }

  async deleteTermMeta(kind: 'category' | 'tag' | 'term', termId: string, key: string) {
    const row = await this.db.one(
      `DELETE FROM term_meta WHERE "termKind" = $1 AND "termId" = $2 AND "metaKey" = $3 RETURNING id`,
      [kind, termId, key],
    );
    if (!row) throw new NotFoundException('Meta not found');
    return { deleted: true };
  }

  private async uniqueSlug(kind: 'category' | 'tag', name: string, exceptId?: string) {
    const base = slugify(name, { lower: true, strict: true }) || 'term';
    const table = kind === 'category' ? 'categories' : 'tags';
    let slug = base;
    let i = 1;
    for (;;) {
      const clash = await this.db.one<{ id: string }>(
        `SELECT id FROM ${table} WHERE slug = $1 AND "siteId" = $2 AND ($3::text IS NULL OR id <> $3)`,
        [slug, currentSiteId(), exceptId ?? null],
      );
      if (!clash) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
}
