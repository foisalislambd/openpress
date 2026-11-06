import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { isFieldType, isMachineSlug } from '../cms/publishing';

const RESERVED_TYPES = ['post', 'page', 'attachment', 'revision', 'nav_menu_item'];
const RESERVED_TAXONOMIES = ['category', 'post_tag'];

@Injectable()
export class ModelingService {
  constructor(private db: DbService) {}

  listPostTypes() {
    return this.db.query(
      `SELECT slug, label, singular, description, public, hierarchical, "hasArchive", supports, builtin, "createdAt"
       FROM post_types
       ORDER BY builtin DESC, label ASC`,
    );
  }

  async createPostType(input: {
    slug: string;
    label: string;
    singular?: string;
    description?: string;
    public?: boolean;
    hierarchical?: boolean;
    hasArchive?: boolean;
    supports?: string[];
  }) {
    const slug = input.slug.trim().toLowerCase();
    if (!isMachineSlug(slug, RESERVED_TYPES)) {
      throw new BadRequestException('Post type slug must be lowercase and not a reserved name');
    }
    if (!input.label.trim()) throw new BadRequestException('Label is required');
    const row = await this.db.one(
      `INSERT INTO post_types (slug, label, singular, description, public, hierarchical, "hasArchive", supports, builtin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, false)
       ON CONFLICT (slug) DO NOTHING
       RETURNING slug, label, singular, description, public, hierarchical, "hasArchive", supports, builtin`,
      [
        slug,
        input.label.trim(),
        (input.singular || input.label).trim(),
        input.description?.trim() || null,
        input.public !== false,
        Boolean(input.hierarchical),
        input.hasArchive !== false,
        JSON.stringify(input.supports ?? ['title', 'editor', 'excerpt', 'thumbnail']),
      ],
    );
    if (!row) throw new BadRequestException('That post type already exists');
    return row;
  }

  async deletePostType(slug: string) {
    const row = await this.db.one<{ builtin: boolean }>(
      'SELECT builtin FROM post_types WHERE slug = $1',
      [slug],
    );
    if (!row) throw new NotFoundException('Post type not found');
    if (row.builtin) throw new BadRequestException('Built-in post types stay registered');
    const used = await this.db.one<{ count: number }>(
      'SELECT count(*)::int AS count FROM contents WHERE "postType" = $1',
      [slug],
    );
    if ((used?.count ?? 0) > 0) {
      throw new BadRequestException('Move or delete content of this type first');
    }
    await this.db.query('DELETE FROM post_types WHERE slug = $1', [slug]);
    return { slug };
  }

  listTaxonomies() {
    return this.db.query(
      `SELECT slug, label, singular, hierarchical, public, "postTypes", builtin, "createdAt"
       FROM taxonomies
       ORDER BY builtin DESC, label ASC`,
    );
  }

  async createTaxonomy(input: {
    slug: string;
    label: string;
    singular?: string;
    hierarchical?: boolean;
    public?: boolean;
    postTypes?: string[];
  }) {
    const slug = input.slug.trim().toLowerCase();
    if (!isMachineSlug(slug, RESERVED_TAXONOMIES)) {
      throw new BadRequestException('Taxonomy slug must be lowercase and not a reserved name');
    }
    const row = await this.db.one(
      `INSERT INTO taxonomies (slug, label, singular, hierarchical, public, "postTypes", builtin)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, false)
       ON CONFLICT (slug) DO NOTHING
       RETURNING slug, label, singular, hierarchical, public, "postTypes", builtin`,
      [
        slug,
        input.label.trim(),
        (input.singular || input.label).trim(),
        Boolean(input.hierarchical),
        input.public !== false,
        JSON.stringify(input.postTypes?.length ? input.postTypes : ['post']),
      ],
    );
    if (!row) throw new BadRequestException('That taxonomy already exists');
    return row;
  }

  async deleteTaxonomy(slug: string) {
    const row = await this.db.one<{ builtin: boolean }>('SELECT builtin FROM taxonomies WHERE slug = $1', [slug]);
    if (!row) throw new NotFoundException('Taxonomy not found');
    if (row.builtin) throw new BadRequestException('Categories and tags stay registered');
    await this.db.query('DELETE FROM taxonomies WHERE slug = $1', [slug]);
    return { slug };
  }

  listTerms(taxonomy: string) {
    return this.db.query(
      `SELECT id, taxonomy, name, slug, description, "parentId", "createdAt"
       FROM terms
       WHERE taxonomy = $1
       ORDER BY name ASC`,
      [taxonomy],
    );
  }

  async createTerm(taxonomy: string, input: { name: string; slug?: string; description?: string; parentId?: string }) {
    const tax = await this.db.one('SELECT slug, hierarchical FROM taxonomies WHERE slug = $1', [taxonomy]);
    if (!tax) throw new NotFoundException('Taxonomy not found');
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const slug = (input.slug || name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new BadRequestException('Slug is required');
    const row = await this.db.one(
      `INSERT INTO terms (id, taxonomy, name, slug, description, "parentId")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, taxonomy, name, slug, description, "parentId"`,
      [newId(), taxonomy, name, slug, input.description?.trim() || null, input.parentId || null],
    );
    return row;
  }

  async deleteTerm(id: string) {
    const row = await this.db.one('DELETE FROM terms WHERE id = $1 RETURNING id', [id]);
    if (!row) throw new NotFoundException('Term not found');
    return row;
  }

  async termsForContent(contentId: string) {
    return this.db.query(
      `SELECT t.id, t.taxonomy, t.name, t.slug
       FROM terms t
       JOIN content_terms ct ON ct."termId" = t.id
       WHERE ct."contentId" = $1
       ORDER BY t.taxonomy, t.name`,
      [contentId],
    );
  }

  async replaceContentTerms(contentId: string, termIds: string[]) {
    const ids = [...new Set(termIds)];
    await this.db.tx(async (sql) => {
      await sql.query('DELETE FROM content_terms WHERE "contentId" = $1', [contentId]);
      if (ids.length === 0) return;
      const found = await sql.query<{ id: string }>('SELECT id FROM terms WHERE id = ANY($1::text[])', [ids]);
      if (found.length !== ids.length) throw new BadRequestException('Unknown term');
      await sql.query(
        `INSERT INTO content_terms ("contentId", "termId")
         SELECT $1, term_id FROM unnest($2::text[]) AS term_id`,
        [contentId, ids],
      );
    });
    return this.termsForContent(contentId);
  }

  listFieldGroups(postType?: string) {
    return this.db.query(
      `SELECT g.id, g.title, g."postTypes", g.position, g."createdAt",
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', f.id,
                    'key', f."fieldKey",
                    'label', f.label,
                    'type', f."fieldType",
                    'settings', f.settings,
                    'sortOrder', f."sortOrder"
                  )
                  ORDER BY f."sortOrder", f.label
                ) FILTER (WHERE f.id IS NOT NULL),
                '[]'::json
              ) AS fields
       FROM field_groups g
       LEFT JOIN field_definitions f ON f."groupId" = g.id
       WHERE ($1::text IS NULL OR g."postTypes" ? $1)
       GROUP BY g.id
       ORDER BY g.title ASC`,
      [postType ?? null],
    );
  }

  async createFieldGroup(input: { title: string; postTypes?: string[]; position?: string }) {
    if (!input.title.trim()) throw new BadRequestException('Title is required');
    return this.db.one(
      `INSERT INTO field_groups (id, title, "postTypes", position)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, title, "postTypes", position`,
      [newId(), input.title.trim(), JSON.stringify(input.postTypes ?? ['post']), input.position === 'side' ? 'side' : 'normal'],
    );
  }

  async deleteFieldGroup(id: string) {
    const row = await this.db.one('DELETE FROM field_groups WHERE id = $1 RETURNING id', [id]);
    if (!row) throw new NotFoundException('Field group not found');
    return row;
  }

  async addField(
    groupId: string,
    input: { key: string; label: string; type: string; settings?: Record<string, unknown> },
  ) {
    const group = await this.db.one('SELECT id FROM field_groups WHERE id = $1', [groupId]);
    if (!group) throw new NotFoundException('Field group not found');
    if (!isFieldType(input.type)) throw new BadRequestException('Unsupported field type');
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(input.key)) {
      throw new BadRequestException('Field key must start with a letter');
    }
    return this.db.one(
      `INSERT INTO field_definitions (id, "groupId", "fieldKey", label, "fieldType", settings, "sortOrder")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE((SELECT max("sortOrder") + 1 FROM field_definitions WHERE "groupId" = $2), 0))
       RETURNING id, "groupId", "fieldKey" AS key, label, "fieldType" AS type, settings`,
      [newId(), groupId, input.key, input.label.trim(), input.type, JSON.stringify(input.settings ?? {})],
    );
  }

  async deleteField(id: string) {
    const row = await this.db.one('DELETE FROM field_definitions WHERE id = $1 RETURNING id', [id]);
    if (!row) throw new NotFoundException('Field not found');
    return row;
  }

  listPatterns() {
    return this.db.query(
      `SELECT id, title, content, synced, "createdAt" FROM patterns ORDER BY title ASC`,
    );
  }

  async createPattern(input: { title: string; content?: unknown[]; synced?: boolean }) {
    if (!input.title.trim()) throw new BadRequestException('Title is required');
    return this.db.one(
      `INSERT INTO patterns (id, title, content, synced)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, title, content, synced, "createdAt"`,
      [newId(), input.title.trim(), JSON.stringify(input.content ?? []), Boolean(input.synced)],
    );
  }

  async updatePattern(id: string, input: { title?: string; content?: unknown[]; synced?: boolean }) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.title != null) {
      params.push(input.title.trim());
      sets.push(`title = $${params.length}`);
    }
    if (input.content != null) {
      params.push(JSON.stringify(input.content));
      sets.push(`content = $${params.length}::jsonb`);
    }
    if (input.synced != null) {
      params.push(input.synced);
      sets.push(`synced = $${params.length}`);
    }
    if (sets.length === 0) throw new BadRequestException('Nothing to update');
    params.push(id);
    const row = await this.db.one(
      `UPDATE patterns SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, title, content, synced, "createdAt"`,
      params,
    );
    if (!row) throw new NotFoundException('Pattern not found');
    return row;
  }

  async deletePattern(id: string) {
    const row = await this.db.one('DELETE FROM patterns WHERE id = $1 RETURNING id', [id]);
    if (!row) throw new NotFoundException('Pattern not found');
    return row;
  }

  async expandSyncedPatterns(blocks: unknown[]): Promise<unknown[]> {
    const ids = new Set<string>();
    const walk = (list: unknown[]) => {
      for (const block of list) {
        if (!block || typeof block !== 'object') continue;
        const record = block as { type?: string; props?: { patternId?: string }; children?: unknown[] };
        if (record.type === 'pattern' && record.props?.patternId) ids.add(record.props.patternId);
        if (Array.isArray(record.children)) walk(record.children);
      }
    };
    walk(blocks);
    if (ids.size === 0) return blocks;
    const rows = await this.db.query<{ id: string; content: unknown; synced: boolean }>(
      'SELECT id, content, synced FROM patterns WHERE id = ANY($1::text[])',
      [[...ids]],
    );
    const synced = new Map(rows.filter((row) => row.synced && Array.isArray(row.content)).map((row) => [row.id, row.content as unknown[]]));
    const replace = (list: unknown[]): unknown[] =>
      list.flatMap((block) => {
        if (!block || typeof block !== 'object') return [block];
        const record = block as { type?: string; props?: { patternId?: string }; children?: unknown[] };
        if (record.type === 'pattern' && record.props?.patternId && synced.has(record.props.patternId)) {
          return replace(synced.get(record.props.patternId) ?? []);
        }
        if (Array.isArray(record.children)) {
          return [{ ...record, children: replace(record.children) }];
        }
        return [block];
      });
    return replace(blocks);
  }
}
