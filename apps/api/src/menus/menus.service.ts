import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db, DbService } from '../db/db.service';
import { isUndefinedTable } from '../db/errors';
import { newId } from '../db/ids';
import { FlatMenuItem, menuParentError, nestMenuItems, safeMenuUrl } from './menu-tree';
import slugify from 'slugify';

@Injectable()
export class MenusService {
  constructor(private db: DbService) {}

  async list() {
    const menus = await this.db.query<{ id: string; name: string; slug: string }>(
      'SELECT id, name, slug FROM nav_menus ORDER BY name ASC',
    );
    const items = await this.db.query<FlatMenuItem & { menuId: string }>(
      `SELECT id, "menuId", "parentId", position, title, url, type, "objectId", target
       FROM nav_menu_items ORDER BY position ASC, title ASC`,
    );
    const locations = await this.locations();
    return {
      menus: menus.map((menu) => ({
        ...menu,
        items: nestMenuItems(items.filter((item) => item.menuId === menu.id).map(stripMenu)),
      })),
      locations,
    };
  }

  async create(name: string) {
    const label = name.trim().slice(0, 80);
    if (!label) throw new BadRequestException('Menu name is required');
    const slug = await this.uniqueSlug(label);
    const id = newId();
    await this.db.query('INSERT INTO nav_menus (id, name, slug) VALUES ($1, $2, $3)', [id, label, slug]);
    await this.syncSettings();
    return this.one(id);
  }

  async rename(id: string, name: string) {
    const label = name.trim().slice(0, 80);
    if (!label) throw new BadRequestException('Menu name is required');
    const updated = await this.db.one('UPDATE nav_menus SET name = $2 WHERE id = $1 RETURNING id', [id, label]);
    if (!updated) throw new NotFoundException('Menu not found');
    await this.syncSettings();
    return this.one(id);
  }

  async remove(id: string) {
    const removed = await this.db.one('DELETE FROM nav_menus WHERE id = $1 RETURNING id', [id]);
    if (!removed) throw new NotFoundException('Menu not found');
    await this.syncSettings();
    return removed;
  }

  async addItem(menuId: string, input: { title: string; url: string; parentId?: string | null; type?: string; objectId?: string | null }) {
    const menu = await this.db.one('SELECT id FROM nav_menus WHERE id = $1', [menuId]);
    if (!menu) throw new NotFoundException('Menu not found');
    const url = safeMenuUrl(input.url);
    if (!url) throw new BadRequestException('Menu URLs must be a site path or an http(s) link');
    const title = input.title.trim().slice(0, 120);
    if (!title) throw new BadRequestException('Menu item title is required');
    const parentId = input.parentId || null;
    if (parentId) {
      const parent = await this.db.one<{ id: string }>(
        'SELECT id FROM nav_menu_items WHERE id = $1 AND "menuId" = $2',
        [parentId, menuId],
      );
      if (!parent) throw new BadRequestException('Parent item was not found');
    }
    const type = ['custom', 'post', 'page', 'category', 'tag'].includes(input.type ?? '') ? input.type! : 'custom';
    const position = await this.db.one<{ max: number }>(
      'SELECT COALESCE(max(position), -1)::int AS max FROM nav_menu_items WHERE "menuId" = $1 AND "parentId" IS NOT DISTINCT FROM $2',
      [menuId, parentId],
    );
    const id = newId();
    await this.db.query(
      `INSERT INTO nav_menu_items (id, "menuId", "parentId", position, title, url, type, "objectId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, menuId, parentId, (position?.max ?? -1) + 1, title, url, type, input.objectId || null],
    );
    await this.syncSettings();
    return { id };
  }

  async updateItem(id: string, input: { title?: string; url?: string; parentId?: string | null; position?: number }) {
    const current = await this.db.one<FlatMenuItem & { menuId: string }>(
      'SELECT id, "menuId", "parentId", position, title, url, type, "objectId", target FROM nav_menu_items WHERE id = $1',
      [id],
    );
    if (!current) throw new NotFoundException('Menu item not found');
    const parentId = input.parentId === undefined ? current.parentId : input.parentId || null;
    const siblings = await this.db.query<{ id: string; parentId: string | null }>(
      'SELECT id, "parentId" FROM nav_menu_items WHERE "menuId" = $1',
      [current.menuId],
    );
    const cycle = menuParentError(siblings, id, parentId);
    if (cycle) throw new BadRequestException(cycle);
    const url = input.url === undefined ? current.url : safeMenuUrl(input.url);
    if (!url) throw new BadRequestException('Menu URLs must be a site path or an http(s) link');
    const title = input.title === undefined ? current.title : input.title.trim().slice(0, 120);
    if (!title) throw new BadRequestException('Menu item title is required');
    await this.db.query(
      `UPDATE nav_menu_items SET title = $2, url = $3, "parentId" = $4, position = $5 WHERE id = $1`,
      [id, title, url, parentId, input.position ?? current.position],
    );
    await this.syncSettings();
    return { id };
  }

  async removeItem(id: string) {
    const removed = await this.db.one('DELETE FROM nav_menu_items WHERE id = $1 RETURNING id', [id]);
    if (!removed) throw new NotFoundException('Menu item not found');
    await this.syncSettings();
    return removed;
  }

  async setLocations(locations: { primary?: string | null; footer?: string | null }) {
    for (const location of ['primary', 'footer'] as const) {
      if (!(location in locations)) continue;
      const menuId = locations[location] || null;
      if (menuId) {
        const menu = await this.db.one('SELECT id FROM nav_menus WHERE id = $1', [menuId]);
        if (!menu) throw new BadRequestException('Menu was not found');
      }
      await this.db.query(
        `INSERT INTO menu_locations (location, "menuId") VALUES ($1, $2)
         ON CONFLICT (location) DO UPDATE SET "menuId" = EXCLUDED."menuId"`,
        [location, menuId],
      );
    }
    await this.syncSettings();
    return this.locations();
  }

  async importSettings(menus: unknown, locations: unknown) {
    if (!Array.isArray(menus)) return;
    await this.db.tx(async (sql) => {
      await sql.query('DELETE FROM nav_menu_items');
      await sql.query('DELETE FROM nav_menus');
      const ids = new Map<string, string>();
      const slugs = new Set<string>();
      for (const menu of menus) {
        if (!menu || typeof menu !== 'object') continue;
        const name = String((menu as { name?: string }).name ?? '').trim().slice(0, 80);
        if (!name) continue;
        const id = newId();
        const slug = slugify(name, { lower: true, strict: true }) || 'menu';
        let unique = slug;
        let n = 1;
        while (slugs.has(unique)) {
          n += 1;
          unique = `${slug}-${n}`;
        }
        slugs.add(unique);
        ids.set(name, id);
        await sql.query('INSERT INTO nav_menus (id, name, slug) VALUES ($1, $2, $3)', [id, name, unique]);
        const items = (menu as { items?: unknown }).items;
        if (Array.isArray(items)) await insertTree(sql, id, items, null);
      }
      const map = locations && typeof locations === 'object' ? (locations as Record<string, unknown>) : {};
      for (const location of ['primary', 'footer']) {
        const name = typeof map[location] === 'string' ? map[location] : '';
        await sql.query(
          `INSERT INTO menu_locations (location, "menuId") VALUES ($1, $2)
           ON CONFLICT (location) DO UPDATE SET "menuId" = EXCLUDED."menuId"`,
          [location, name ? ids.get(String(name)) ?? null : null],
        );
      }
    });
  }

  async overlay(current: Record<string, unknown>) {
    let count: { count: number } | null;
    try {
      count = await this.db.one<{ count: number }>('SELECT count(*)::int AS count FROM nav_menus');
    } catch (error) {
      if (isUndefinedTable(error)) return current;
      throw error;
    }
    if (!count?.count) return current;
    const listed = await this.list();
    const byId = new Map(listed.menus.map((menu) => [menu.id, menu.name]));
    return {
      ...current,
      menus: listed.menus.map((menu) => ({
        name: menu.name,
        items: flatten(menu.items),
      })),
      menuLocations: {
        primary: listed.locations.primary ? byId.get(listed.locations.primary) ?? '' : '',
        footer: listed.locations.footer ? byId.get(listed.locations.footer) ?? '' : '',
      },
    };
  }

  private async locations() {
    const rows = await this.db.query<{ location: string; menuId: string | null }>(
      'SELECT location, "menuId" FROM menu_locations',
    );
    return {
      primary: rows.find((row) => row.location === 'primary')?.menuId ?? null,
      footer: rows.find((row) => row.location === 'footer')?.menuId ?? null,
    };
  }

  private async one(id: string) {
    const listed = await this.list();
    const menu = listed.menus.find((item) => item.id === id);
    if (!menu) throw new NotFoundException('Menu not found');
    return menu;
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name, { lower: true, strict: true }) || 'menu';
    let slug = base;
    let n = 1;
    for (;;) {
      const clash = await this.db.one('SELECT id FROM nav_menus WHERE slug = $1', [slug]);
      if (!clash) return slug;
      n += 1;
      slug = `${base}-${n}`;
    }
  }

  private async syncSettings() {
    const listed = await this.list();
    const byId = new Map(listed.menus.map((menu) => [menu.id, menu.name]));
    const menus = listed.menus.map((menu) => ({ name: menu.name, items: flatten(menu.items) }));
    const menuLocations = {
      primary: listed.locations.primary ? byId.get(listed.locations.primary) ?? '' : '',
      footer: listed.locations.footer ? byId.get(listed.locations.footer) ?? '' : '',
    };
    await this.writeSetting('menus', menus);
    await this.writeSetting('menuLocations', menuLocations);
  }

  private async writeSetting(key: string, value: unknown) {
    await this.db.query(
      `INSERT INTO settings (key, value, autoload, "updatedAt")
       VALUES ($1, $2::jsonb, true, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [key, JSON.stringify(value)],
    );
  }
}

async function insertTree(sql: Db, menuId: string, items: unknown[], parentId: string | null) {
  let position = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as { label?: string; title?: string; url?: string; children?: unknown[] };
    const title = String(record.title || record.label || '').trim().slice(0, 120);
    const url = safeMenuUrl(String(record.url || '/')) || '/';
    if (!title) continue;
    const id = newId();
    await sql.query(
      `INSERT INTO nav_menu_items (id, "menuId", "parentId", position, title, url, type)
       VALUES ($1, $2, $3, $4, $5, $6, 'custom')`,
      [id, menuId, parentId, position, title, url],
    );
    position += 1;
    if (Array.isArray(record.children)) await insertTree(sql, menuId, record.children, id);
  }
}

function stripMenu(item: FlatMenuItem & { menuId?: string }): FlatMenuItem {
  return {
    id: item.id,
    parentId: item.parentId,
    position: item.position,
    title: item.title,
    url: item.url,
    type: item.type,
    objectId: item.objectId,
    target: item.target,
  };
}

function flatten(items: { title: string; url: string; children?: { title: string; url: string }[] }[]): unknown[] {
  return items.map((item) => ({
    label: item.title,
    url: item.url,
    children: item.children?.length ? flatten(item.children) : undefined,
  }));
}
