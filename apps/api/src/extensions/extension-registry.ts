import { Injectable } from '@nestjs/common';

export interface AdminField {
  key: string;
  label: string;
  type: 'text' | 'textarea';
}

export interface AdminPage {
  pluginId: string;
  slug: string;
  title: string;
  menuTitle: string;
  fields: AdminField[];
}

export interface WidgetType {
  pluginId: string;
  id: string;
  name: string;
  render: (instance: { title?: string; text?: string }) => string | Promise<string>;
}

export interface Shortcode {
  pluginId: string;
  tag: string;
  render: (attrs: Record<string, string>) => string | Promise<string>;
}

export interface EditorBlock {
  pluginId: string;
  name: string;
  title: string;
  description?: string;
}

export interface PluginRoute {
  pluginId: string;
  method: string;
  path: string;
  handler: (req: { query: Record<string, string>; body: unknown }) => unknown | Promise<unknown>;
}

export interface PluginAsset {
  pluginId: string;
  handle: string;
  href: string;
  kind: 'style' | 'script';
  file: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function escapePluginText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function expandShortcodes(input: string, render: (tag: string, attrs: Record<string, string>) => string) {
  return input.replace(/\[([a-zA-Z][\w-]*)(\s+[^\]]+)?\]/g, (full, tag: string, raw: string | undefined) => {
    const attrs: Record<string, string> = {};
    if (raw) {
      for (const match of raw.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
    }
    const next = render(tag, attrs);
    return next === full ? full : next;
  });
}

@Injectable()
export class ExtensionRegistry {
  private pages: AdminPage[] = [];
  private widgets: WidgetType[] = [];
  private shortcodes: Shortcode[] = [];
  private blocks: EditorBlock[] = [];
  private routes: PluginRoute[] = [];
  private assets: PluginAsset[] = [];

  clear(pluginId: string) {
    const keep = <T extends { pluginId: string }>(rows: T[]) => rows.filter((row) => row.pluginId !== pluginId);
    this.pages = keep(this.pages);
    this.widgets = keep(this.widgets);
    this.shortcodes = keep(this.shortcodes);
    this.blocks = keep(this.blocks);
    this.routes = keep(this.routes);
    this.assets = keep(this.assets);
  }

  addPage(page: AdminPage) {
    if (!SLUG_RE.test(page.slug)) throw new Error('Admin page slug must be lowercase');
    this.pages = this.pages.filter((row) => !(row.pluginId === page.pluginId && row.slug === page.slug));
    this.pages.push(page);
  }

  addWidget(widget: WidgetType) {
    this.widgets = this.widgets.filter((row) => !(row.pluginId === widget.pluginId && row.id === widget.id));
    this.widgets.push(widget);
  }

  addShortcode(shortcode: Shortcode) {
    this.shortcodes = this.shortcodes.filter(
      (row) => !(row.pluginId === shortcode.pluginId && row.tag === shortcode.tag),
    );
    this.shortcodes.push(shortcode);
  }

  addBlock(block: EditorBlock) {
    this.blocks = this.blocks.filter((row) => !(row.pluginId === block.pluginId && row.name === block.name));
    this.blocks.push(block);
  }

  addRoute(route: PluginRoute) {
    const method = route.method.toUpperCase();
    this.routes = this.routes.filter(
      (row) => !(row.pluginId === route.pluginId && row.method === method && row.path === route.path),
    );
    this.routes.push({ ...route, method });
  }

  addAsset(asset: PluginAsset) {
    this.assets = this.assets.filter(
      (row) => !(row.pluginId === asset.pluginId && row.handle === asset.handle && row.kind === asset.kind),
    );
    this.assets.push(asset);
  }

  adminPages() {
    return this.pages.map(({ pluginId, slug, title, menuTitle, fields }) => ({
      pluginId,
      slug,
      title,
      menuTitle,
      fields,
    }));
  }

  page(pluginId: string, slug: string) {
    return this.pages.find((page) => page.pluginId === pluginId && page.slug === slug) ?? null;
  }

  widgetTypes() {
    return this.widgets.map(({ pluginId, id, name }) => ({ pluginId, id, name, type: `${pluginId}/${id}` }));
  }

  blocksForEditor() {
    return this.blocks.map(({ pluginId, name, title, description }) => ({ pluginId, name, title, description }));
  }

  assetsForSite() {
    return this.assets.map(({ pluginId, href, kind, handle }) => ({ pluginId, href, kind, handle }));
  }

  assetFile(pluginId: string, file: string) {
    return this.assets.find((asset) => asset.pluginId === pluginId && asset.file === file) ?? null;
  }

  async route(pluginId: string, method: string, path: string, query: Record<string, string>, body: unknown) {
    const found = this.routes.find(
      (route) => route.pluginId === pluginId && route.method === method.toUpperCase() && route.path === path,
    );
    if (!found) return null;
    return found.handler({ query, body });
  }

  async renderWidgets(areaItems: { type?: string; title?: string; text?: string }[]) {
    const html: string[] = [];
    for (const item of areaItems) {
      const [pluginId, id] = String(item.type ?? '').split('/');
      const widget = this.widgets.find((row) => row.pluginId === pluginId && row.id === id);
      const text = widget ? String(await widget.render(item)) : item.text ?? '';
      const title = item.title ? `${item.title}: ` : '';
      if (title || text) html.push(`${title}${text}`);
    }
    return html;
  }

  async expandBlocks(blocks: unknown[]): Promise<unknown[]> {
    const apply = async (input: string) => {
      const matches = [...input.matchAll(/\[([a-zA-Z][\w-]*)(\s+[^\]]+)?\]/g)];
      let next = input;
      for (const match of matches) {
        const shortcode = this.shortcodes.find((row) => row.tag === match[1]);
        if (!shortcode) continue;
        const attrs: Record<string, string> = {};
        if (match[2]) {
          for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
        }
        const rendered = escapePluginText(String(await shortcode.render(attrs)));
        next = next.replace(match[0], rendered);
      }
      return next;
    };

    const walk = async (nodes: unknown[]): Promise<unknown[]> => {
      const out: unknown[] = [];
      for (const block of nodes) {
        if (!block || typeof block !== 'object') {
          out.push(block);
          continue;
        }
        const record = block as { content?: unknown; children?: unknown };
        let content = record.content;
        if (Array.isArray(content)) {
          content = await Promise.all(
            content.map(async (node) => {
              if (node && typeof node === 'object' && typeof (node as { text?: unknown }).text === 'string') {
                return { ...node, text: await apply((node as { text: string }).text) };
              }
              return node;
            }),
          );
        }
        const children = Array.isArray(record.children) ? await walk(record.children) : record.children;
        out.push({ ...record, content, children });
      }
      return out;
    };
    return walk(Array.isArray(blocks) ? blocks : []);
  }
}
