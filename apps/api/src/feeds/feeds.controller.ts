import { Controller, Get, Header } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { SettingsService } from '../settings/settings.service';
import { xmlEscape } from './wxr';

@Controller()
export class FeedsController {
  constructor(
    private db: DbService,
    private settings: SettingsService,
  ) {}

  @Get('feed')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  async feed() {
    const settings = await this.settings.getAll();
    const siteUrl = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
    const rows = await this.db.query<{
      title: string;
      slug: string;
      excerpt: string | null;
      publishedAt: Date | null;
    }>(
      `SELECT title, slug, excerpt, "publishedAt"
       FROM contents
       WHERE type = 'POST' AND status = 'PUBLISHED' AND visibility = 'PUBLIC'
       ORDER BY sticky DESC, "publishedAt" DESC NULLS LAST
       LIMIT 20`,
    );
    const items = rows
      .map((row) => {
        const link = `${siteUrl}/${encodeURIComponent(row.slug)}`;
        const when = row.publishedAt ? new Date(row.publishedAt).toUTCString() : new Date().toUTCString();
        return `<item>
<title>${xmlEscape(row.title)}</title>
<link>${xmlEscape(link)}</link>
<guid isPermaLink="true">${xmlEscape(link)}</guid>
<pubDate>${when}</pubDate>
<description>${xmlEscape(row.excerpt ?? '')}</description>
</item>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
<title>${xmlEscape(String(settings.siteTitle ?? 'OpenPress'))}</title>
<link>${xmlEscape(siteUrl)}</link>
<description>${xmlEscape(String(settings.siteDescription ?? ''))}</description>
${items}
</channel>
</rss>`;
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async sitemap() {
    const siteUrl = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
    const rows = await this.db.query<{ slug: string; updatedAt: Date }>(
      `SELECT slug, "updatedAt"
       FROM contents
       WHERE status = 'PUBLISHED' AND visibility = 'PUBLIC'
       ORDER BY "updatedAt" DESC`,
    );
    const urls = [
      `<url><loc>${xmlEscape(siteUrl)}/</loc></url>`,
      ...rows.map(
        (row) =>
          `<url><loc>${xmlEscape(`${siteUrl}/${encodeURIComponent(row.slug)}`)}</loc><lastmod>${new Date(row.updatedAt).toISOString()}</lastmod></url>`,
      ),
    ];
    return `<?xml version="1.0" encoding="UTF-8" ?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  }
}
