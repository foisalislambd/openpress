import { Injectable, NotFoundException } from '@nestjs/common';
import { blocksToHtml } from '../cms/publishing';
import { ContentService } from '../content/content.service';
import { DbService } from '../db/db.service';
import { currentSiteId } from '../sites/site-context';

type WpStatus = 'publish' | 'draft' | 'pending' | 'future' | 'trash';

@Injectable()
export class WpService {
  constructor(
    private content: ContentService,
    private db: DbService,
  ) {}

  async posts(query: { page?: string; per_page?: string; search?: string; status?: string }, embed: boolean, publicOnly: boolean) {
    const status = fromWpStatus(query.status);
    const result = await this.content.findAll(
      {
        type: 'POST',
        postType: 'post',
        status,
        search: query.search,
        page: query.page ?? '1',
        perPage: query.per_page ?? '10',
      },
      publicOnly,
    );
    const items = await Promise.all(result.items.map((item) => this.toPost(item, embed)));
    return { items, total: result.total };
  }

  async pages(query: { page?: string; per_page?: string; search?: string }, embed: boolean) {
    const result = await this.content.findAll(
      { type: 'PAGE', search: query.search, page: query.page ?? '1', perPage: query.per_page ?? '10' },
      true,
    );
    return Promise.all(result.items.map((item) => this.toPost(item, embed)));
  }

  async one(id: string, embed: boolean) {
    const content = await this.content.findOne(id, true).catch(() => null);
    if (!content) throw new NotFoundException('Post not found');
    return this.toPost(content, embed);
  }

  async media(page = '1', perPage = '10') {
    const limit = Math.min(100, Math.max(1, Number(perPage) || 10));
    const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
    return this.db.query(
      `SELECT id, filename, url, alt, caption, "mimeType", width, height, "createdAt"
       FROM media
       WHERE "siteId" = $3
       ORDER BY "createdAt" DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, currentSiteId()],
    ).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        date: row.createdAt,
        slug: row.filename,
        type: 'attachment',
        link: row.url,
        title: { rendered: row.filename },
        alt_text: row.alt ?? '',
        caption: { rendered: row.caption ?? '' },
        mime_type: row.mimeType,
        media_details: { width: row.width, height: row.height },
        source_url: row.url,
      })),
    );
  }

  categories() {
    return this.db.query<{ id: string; name: string; slug: string; description: string | null; parentId: string | null }>(
      'SELECT id, name, slug, description, "parentId" FROM categories WHERE "siteId" = $1 ORDER BY name',
      [currentSiteId()],
    ).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? '',
        parent: row.parentId,
      })),
    );
  }

  tags() {
    return this.db.query<{ id: string; name: string; slug: string }>('SELECT id, name, slug FROM tags WHERE "siteId" = $1 ORDER BY name', [currentSiteId()]).then(
      (rows) => rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
    );
  }

  private async toPost(item: Record<string, unknown>, embed: boolean) {
    const author = item.author as { id?: string; name?: string } | undefined;
    const categories = (item.categories as { id: string; name: string; slug: string }[] | undefined) ?? [];
    const tags = (item.tags as { id: string; name: string; slug: string }[] | undefined) ?? [];
    const rendered = blocksToHtml(item.blocks);
    const post = {
      id: item.id,
      date: item.publishedAt ?? item.createdAt,
      slug: item.slug,
      status: toWpStatus(String(item.status)),
      type: item.type === 'PAGE' ? 'page' : 'post',
      link: item.permalink ?? `/${item.slug}`,
      title: { rendered: item.title },
      content: { rendered, protected: Boolean(item.passwordRequired) },
      excerpt: { rendered: item.excerpt ? `<p>${item.excerpt}</p>` : '' },
      author: author?.id ?? item.authorId,
      featured_media: 0,
      categories: categories.map((term) => term.id),
      tags: tags.map((term) => term.id),
    };
    if (!embed) return post;
    return {
      ...post,
      _embedded: {
        author: author ? [{ id: author.id, name: author.name }] : [],
        'wp:term': [categories, tags],
      },
    };
  }
}

function toWpStatus(status: string): WpStatus {
  switch (status) {
    case 'PUBLISHED':
      return 'publish';
    case 'PENDING':
      return 'pending';
    case 'SCHEDULED':
      return 'future';
    case 'TRASHED':
      return 'trash';
    default:
      return 'draft';
  }
}

function fromWpStatus(status?: string) {
  switch (status) {
    case 'publish':
      return 'PUBLISHED';
    case 'pending':
      return 'PENDING';
    case 'future':
      return 'SCHEDULED';
    case 'trash':
      return 'TRASHED';
    case 'draft':
      return 'DRAFT';
    default:
      return undefined;
  }
}
