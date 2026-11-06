import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { isUndefinedTable, isUniqueViolation } from '../db/errors';
import { newId } from '../db/ids';
import { PRIMARY_SITE_ID, currentSiteId } from './site-context';

const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
const OPTION_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export type SiteRow = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  path: string;
  status: string;
};

@Injectable()
export class SitesService {
  constructor(private db: DbService) {}

  async list() {
    try {
      return await this.db.query<SiteRow>(
        `SELECT id, name, slug, domain, path, status FROM sites ORDER BY "createdAt" ASC`,
      );
    } catch (error) {
      if (isUndefinedTable(error)) return [primaryFallback()];
      throw error;
    }
  }

  async resolve(input: { slug?: string; host?: string }) {
    const sites = await this.list();
    const slug = input.slug?.trim().toLowerCase();
    if (slug) {
      const match = sites.find((site) => site.slug === slug && site.status === 'public');
      if (match) return match.id;
    }
    const host = hostname(input.host);
    if (host) {
      const match = sites.find((site) => site.domain === host && site.status === 'public');
      if (match) return match.id;
    }
    return sites.find((site) => site.id === PRIMARY_SITE_ID)?.id ?? sites[0]?.id ?? PRIMARY_SITE_ID;
  }

  async create(input: { name: string; slug: string; domain?: string }) {
    const name = input.name.trim().slice(0, 80);
    const slug = input.slug.trim().toLowerCase();
    const domain = hostname(input.domain) ?? '';
    if (!name) throw new BadRequestException('Site name is required');
    if (!SLUG.test(slug) || slug === 'primary') throw new BadRequestException('Invalid site slug');
    try {
      return await this.db.one<SiteRow>(
        `INSERT INTO sites (id, name, slug, domain, path)
         VALUES ($1, $2, $3, $4, '/')
         RETURNING id, name, slug, domain, path, status`,
        [newId(), name, slug, domain],
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('A site with that slug already exists');
      throw error;
    }
  }

  async update(id: string, input: { name?: string; domain?: string; status?: string }) {
    if (input.status && input.status !== 'public' && input.status !== 'archived') {
      throw new BadRequestException('Invalid site status');
    }
    if (id === PRIMARY_SITE_ID && input.status === 'archived') {
      throw new BadRequestException('The primary site stays public');
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (input.name !== undefined) add('name', input.name.trim().slice(0, 80));
    if (input.domain !== undefined) add('domain', hostname(input.domain) ?? '');
    if (input.status !== undefined) add('status', input.status);
    if (!sets.length) throw new BadRequestException('Nothing to update');
    params.push(id);
    const row = await this.db.one<SiteRow>(
      `UPDATE sites SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, slug, domain, path, status`,
      params,
    );
    if (!row) throw new NotFoundException('Site not found');
    return row;
  }

  async options() {
    const siteId = currentSiteId();
    const rows = await this.db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM site_options WHERE "siteId" = $1 ORDER BY key',
      [siteId],
    );
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async setOption(key: string, value: unknown) {
    if (!OPTION_KEY.test(key)) throw new BadRequestException('Invalid option key');
    await this.db.query(
      `INSERT INTO site_options ("siteId", key, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT ("siteId", key) DO UPDATE SET value = EXCLUDED.value`,
      [currentSiteId(), key, JSON.stringify(value ?? null)],
    );
    return { key, value };
  }
}

function primaryFallback(): SiteRow {
  return { id: PRIMARY_SITE_ID, name: 'Primary', slug: 'primary', domain: '', path: '/', status: 'public' };
}

function hostname(value: string | undefined) {
  if (!value) return '';
  const host = value.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  if (!host || host.length > 253 || /[^a-z0-9.-]/.test(host)) return '';
  return host;
}
