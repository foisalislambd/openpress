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
       ORDER BY c.name ASC`,
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
        `INSERT INTO categories (id, name, slug, description, "parentId")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, slug, description, "parentId", "createdAt"`,
        [
          newId(),
          name,
          await this.uniqueSlug('category', name),
          description ?? null,
          parentId || null,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A category with this slug already exists');
      }
      throw error;
    }
  }

  async updateCategory(id: string, name?: string, description?: string) {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (name !== undefined) {
      add('name', name);
      add('slug', slugify(name, { lower: true, strict: true }) || 'term');
    }
    if (description !== undefined) add('description', description);
    if (sets.length === 0) {
      const current = await this.db.one(
        `SELECT id, name, slug, description, "parentId", "createdAt"
         FROM categories WHERE id = $1`,
        [id],
      );
      if (!current) throw new NotFoundException('Category not found');
      return current;
    }
    params.push(id);
    try {
      const row = await this.db.one(
        `UPDATE categories SET ${sets.join(', ')}
         WHERE id = $${params.length}
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
      'DELETE FROM categories WHERE id = $1 RETURNING id',
      [id],
    );
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  async tags() {
    const rows = await this.db.query<TermRow>(
      `SELECT t.id, t.name, t.slug, t."createdAt",
              (SELECT count(*)::int FROM "_ContentTags" ct WHERE ct."B" = t.id) AS "contentCount"
       FROM tags t
       ORDER BY t.name ASC`,
    );
    return rows.map(presentTerm);
  }

  async createTag(name: string) {
    try {
      return await this.db.one(
        `INSERT INTO tags (id, name, slug)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug, "createdAt"`,
        [newId(), name, await this.uniqueSlug('tag', name)],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A tag with this slug already exists');
      }
      throw error;
    }
  }

  async removeTag(id: string) {
    const row = await this.db.one<{ id: string }>(
      'DELETE FROM tags WHERE id = $1 RETURNING id',
      [id],
    );
    if (!row) throw new NotFoundException('Tag not found');
    return row;
  }

  private async uniqueSlug(kind: 'category' | 'tag', name: string) {
    const base = slugify(name, { lower: true, strict: true }) || 'term';
    const table = kind === 'category' ? 'categories' : 'tags';
    let slug = base;
    let i = 1;
    for (;;) {
      const clash = await this.db.one<{ id: string }>(
        `SELECT id FROM ${table} WHERE slug = $1`,
        [slug],
      );
      if (!clash) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }
}
