import { Controller, Get, Query } from '@nestjs/common';
import { buildPermalink, isPlainPermalink, matchPermalink, templateCandidates } from '../cms/publishing';
import { DbService } from '../db/db.service';
import { SettingsService } from '../settings/settings.service';

@Controller('permalinks')
export class PermalinksController {
  constructor(
    private db: DbService,
    private settings: SettingsService,
  ) {}

  @Get('resolve')
  async resolve(@Query('path') path = '') {
    if (!path.startsWith('/') || path.includes('..')) return { action: 'none' };
    const settings = await this.settings.getAll();
    const structure = String(settings.permalinkStructure ?? '/%postname%/');
    if (isPlainPermalink(structure)) return { action: 'none' };
    const matched = matchPermalink(structure, path);
    if (matched) {
      const row = await this.lookup(matched.slug);
      if (!row) return { action: 'none' };
      return { action: 'rewrite', slug: row.slug };
    }
    const slug = path.replace(/^\//, '').replace(/\/$/, '');
    if (!slug || slug.includes('/')) return { action: 'none' };
    const row = await this.lookup(slug);
    if (!row || row.status !== 'PUBLISHED') return { action: 'none' };
    const canonical = buildPermalink(structure, {
      slug: row.slug,
      publishedAt: row.publishedAt,
      category: row.category,
      author: row.author,
    });
    const normalized = path.endsWith('/') && canonical.endsWith('/') ? path : path.replace(/\/$/, '');
    if (canonical !== path && canonical !== normalized && canonical !== `${normalized}/`) {
      return { action: 'redirect', to: canonical, statusCode: 301 };
    }
    return { action: 'none' };
  }

  @Get('templates')
  templates(
    @Query('kind') kind = 'single',
    @Query('postType') postType?: string,
    @Query('slug') slug?: string,
    @Query('taxonomy') taxonomy?: string,
    @Query('term') term?: string,
  ) {
    const safeKind = kind === 'archive' || kind === 'home' || kind === 'search' ? kind : 'single';
    return {
      templates: templateCandidates({ kind: safeKind, postType, slug, taxonomy, term }),
    };
  }

  private lookup(slug: string) {
    return this.db.one<{
      slug: string;
      status: string;
      publishedAt: Date | null;
      category: string | null;
      author: string | null;
    }>(
      `SELECT c.slug, c.status, c."publishedAt",
              (SELECT cat.slug FROM categories cat
                JOIN "_ContentCategories" cc ON cc."A" = cat.id
                WHERE cc."B" = c.id ORDER BY cat.name LIMIT 1) AS category,
              u.name AS author
       FROM contents c
       JOIN users u ON u.id = c."authorId"
       WHERE c.slug = $1`,
      [slug],
    );
  }
}
