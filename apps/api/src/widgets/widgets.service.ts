import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { isUndefinedTable } from '../db/errors';
import { newId } from '../db/ids';
import { ExtensionRegistry } from '../extensions/extension-registry';
import { CORE_WIDGETS, coreWidgetView, isCoreWidget, sanitizeWidgetSettings, widgetPlainText, WidgetView } from './widget-render';
import { currentSiteId } from '../sites/site-context';

@Injectable()
export class WidgetsService {
  constructor(
    private db: DbService,
    private registry: ExtensionRegistry,
  ) {}

  types() {
    return [
      ...CORE_WIDGETS.map((widget) => ({ type: widget.type, title: widget.title, source: 'core' })),
      ...this.registry.widgetTypes().map((widget) => ({ type: widget.type, title: widget.name, source: widget.pluginId })),
    ];
  }

  async list() {
    const rows = await this.instances();
    const areas: Record<string, typeof rows> = { sidebar: [], footer: [] };
    for (const row of rows) (areas[row.area] ??= []).push(row);
    return { types: this.types(), areas };
  }

  async create(input: { area: string; type: string; title?: string; text?: string }) {
    const area = areaOf(input.area);
    this.assertType(input.type);
    const position = await this.db.one<{ max: number }>(
      'SELECT COALESCE(max(position), -1)::int AS max FROM widget_instances WHERE area = $1 AND "siteId" = $2',
      [area, currentSiteId()],
    );
    const id = newId();
    const settings = sanitizeWidgetSettings(input.type, { title: input.title ?? '', text: input.text ?? '' });
    await this.db.query(
      `INSERT INTO widget_instances (id, area, type, position, settings, "siteId") VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [id, area, input.type, (position?.max ?? -1) + 1, JSON.stringify(settings), currentSiteId()],
    );
    await this.syncSettings();
    return { id };
  }

  async update(id: string, input: { title?: string; text?: string; position?: number; area?: string }) {
    const current = await this.db.one<{ id: string; type: string; settings: Record<string, unknown>; area: string; position: number }>(
      'SELECT id, type, settings, area, position FROM widget_instances WHERE id = $1 AND "siteId" = $2',
      [id, currentSiteId()],
    );
    if (!current) throw new NotFoundException('Widget not found');
    const settings = sanitizeWidgetSettings(current.type, {
      ...current.settings,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
    });
    const area = input.area ? areaOf(input.area) : current.area;
    await this.db.query(
      `UPDATE widget_instances SET settings = $2::jsonb, position = $3, area = $4 WHERE id = $1`,
      [id, JSON.stringify(settings), input.position ?? current.position, area],
    );
    await this.syncSettings();
    return { id };
  }

  async remove(id: string) {
    const removed = await this.db.one('DELETE FROM widget_instances WHERE id = $1 AND "siteId" = $2 RETURNING id', [id, currentSiteId()]);
    if (!removed) throw new NotFoundException('Widget not found');
    await this.syncSettings();
    return removed;
  }

  async renderPublic() {
    const rows = await this.instances().catch((error) => {
      if (isUndefinedTable(error)) return [];
      throw error;
    });
    const source = rows.length ? rows : await this.legacyRows();
    const posts = await this.db.query<{ title: string; slug: string }>(
      `SELECT title, slug FROM contents
       WHERE status = 'PUBLISHED' AND visibility = 'PUBLIC' AND type = 'POST' AND "postType" = 'post' AND "siteId" = $1
       ORDER BY "publishedAt" DESC NULLS LAST LIMIT 5`,
      [currentSiteId()],
    );
    const categories = await this.db.query<{ name: string; slug: string }>(
      'SELECT name, slug FROM categories WHERE "siteId" = $1 ORDER BY name ASC LIMIT 20',
      [currentSiteId()],
    );
    const render = async (area: string) => {
      const views: WidgetView[] = [];
      for (const row of source.filter((item) => item.area === area)) {
        const core = coreWidgetView(row, { posts, categories });
        if (core) {
          views.push(core);
          continue;
        }
        const html = await this.registry.renderWidgets([
          { type: row.type, title: String(row.settings.title ?? ''), text: String(row.settings.text ?? '') },
        ]);
        views.push({
          id: row.id,
          type: row.type,
          title: String(row.settings.title ?? ''),
          text: html[0] ?? String(row.settings.text ?? ''),
        });
      }
      return views;
    };
    const names = [...new Set(['sidebar', 'footer', ...source.map((row) => row.area)])];
    const areas: Record<string, WidgetView[]> = {};
    const widgets: Record<string, string[]> = {};
    for (const name of names) {
      areas[name] = await render(name);
      widgets[name] = areas[name].map(widgetPlainText);
    }
    return { areas, widgets };
  }

  async importSettings(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    await this.db.tx(async (sql) => {
      await sql.query('DELETE FROM widget_instances WHERE "siteId" = $1', [currentSiteId()]);
      for (const [area, raw] of Object.entries(record)) {
        if (!/^[a-z][a-z0-9-]{0,30}$/.test(area) || !Array.isArray(raw)) continue;
        let position = 0;
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue;
          const row = item as { type?: string; title?: string; text?: string };
          const type = String(row.type ?? 'text');
          if (!isCoreWidget(type) && !type.includes('/')) continue;
          await sql.query(
            `INSERT INTO widget_instances (id, area, type, position, settings, "siteId") VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
            [newId(), area, type, position, JSON.stringify(sanitizeWidgetSettings(type, { title: row.title ?? '', text: row.text ?? '' })), currentSiteId()],
          );
          position += 1;
        }
      }
    });
  }

  async overlay(current: Record<string, unknown>) {
    try {
      const count = await this.db.one<{ count: number }>('SELECT count(*)::int AS count FROM widget_instances');
      if (!count?.count) return current;
      const listed = await this.list();
      return { ...current, widgets: project(listed.areas) };
    } catch (error) {
      if (isUndefinedTable(error)) return current;
      throw error;
    }
  }

  private assertType(type: string) {
    if (isCoreWidget(type)) return;
    if (this.types().some((widget) => widget.type === type)) return;
    throw new BadRequestException('Unknown widget type');
  }

  private async instances() {
    return this.db.query<{ id: string; area: string; type: string; position: number; settings: Record<string, unknown> }>(
      'SELECT id, area, type, position, settings FROM widget_instances WHERE "siteId" = $1 ORDER BY position ASC',
      [currentSiteId()],
    );
  }

  private async legacyRows() {
    const row = await this.db.one<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', ['widgets']);
    const value = (row?.value ?? {}) as { sidebar?: unknown[]; footer?: unknown[] };
    const map = (area: 'sidebar' | 'footer', items: unknown[] | undefined) =>
      (items ?? []).flatMap((item, index) => {
        if (!item || typeof item !== 'object') return [];
        const record = item as { id?: string; type?: string; title?: string; text?: string };
        return [{
          id: record.id || `${area}-${index}`,
          area,
          type: String(record.type ?? 'text'),
          position: index,
          settings: { title: record.title ?? '', text: record.text ?? '' },
        }];
      });
    return [...map('sidebar', value.sidebar), ...map('footer', value.footer)];
  }

  private async syncSettings() {
    const listed = await this.list();
    await this.db.query(
      `INSERT INTO settings (key, value, autoload, "updatedAt")
       VALUES ('widgets', $1::jsonb, true, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [JSON.stringify(project(listed.areas))],
    );
  }
}

function areaOf(value: string) {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(value)) throw new BadRequestException('Widget area must be a lowercase id');
  return value;
}

function project(areas: Record<string, { type: string; settings: Record<string, unknown> }[]>) {
  const map = (items: { type: string; settings: Record<string, unknown> }[]) =>
    items.map((item) => ({
      type: item.type,
      title: String(item.settings.title ?? ''),
      text: String(item.settings.text ?? ''),
    }));
  const projected: Record<string, { type: string; title: string; text: string }[]> = {};
  for (const [area, items] of Object.entries(areas)) projected[area] = map(items);
  if (!projected.sidebar) projected.sidebar = [];
  if (!projected.footer) projected.footer = [];
  return projected;
}
