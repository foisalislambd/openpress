import { Controller, Get, Query } from '@nestjs/common';
import { permalinkDecision, templateCandidates } from '../cms/publishing';
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
    const slug = path.split('/').filter(Boolean).at(-1);
    if (!slug) return { action: 'none' };
    const row = await this.lookup(slug);
    return permalinkDecision(structure, path, row);
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
