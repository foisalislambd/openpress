import { Injectable } from '@nestjs/common';
import { kses } from '../html/kses';
import { CollectionSchema } from './collections';

export interface AdminField {
  key: string;
  label: string;
  type: 'text' | 'textarea';
}

export interface AdminColumn {
  key: string;
  label: string;
}

export interface AdminPage {
  pluginId: string;
  slug: string;
  title: string;
  menuTitle: string;
  fields: AdminField[];
  /** form saves settings. list reads a collection. content lists a post type. html is pre-sanitized. app is an isolated bundle. */
  screen?: 'form' | 'list' | 'content' | 'html' | 'app';
  collection?: string;
  postType?: string;
  columns?: AdminColumn[];
  html?: string;
  /** Plugin-relative HTML file for an app screen. Not sent to the browser. */
  entry?: string;
}

export interface MetaBox {
  pluginId: string;
  id: string;
  title: string;
  postTypes: string[];
  fields: AdminField[];
}

export interface DashboardWidget {
  pluginId: string;
  id: string;
  title: string;
  render: () => string | Promise<string>;
}

export interface AdminNotice {
  pluginId: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
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

export interface PluginForm {
  pluginId: string;
  id: string;
  title: string;
  fields: AdminField[];
  submit: (values: Record<string, string>) => unknown | Promise<unknown>;
}

export interface EditorBlock {
  pluginId: string;
  name: string;
  title: string;
  description?: string;
  attributes?: { key: string; type: 'string' | 'number' | 'boolean'; label?: string }[];
  /** Plugin-relative HTML file for the isolated block editor. */
  editor?: string;
  render?: (props: Record<string, unknown>) => string | Promise<string>;
}

export interface GraphqlTypeDef {
  pluginId: string;
  sdl: string;
}

export interface GraphqlFieldDef {
  pluginId: string;
  role: 'query' | 'mutation';
  name: string;
  args: string;
  returns: string;
  resolve: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

export interface PluginRoute {
  pluginId: string;
  method: string;
  path: string;
  /** When true, the route requires a signed-in session. The iframe never sees that session. */
  auth?: boolean;
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

function styleClass(props: Record<string, unknown> | undefined) {
  const style = typeof props?.blockStyle === 'string' ? props.blockStyle : '';
  const current = typeof props?.className === 'string' ? props.className : '';
  if (!/^[a-z0-9-]{1,40}$/.test(style)) return current;
  const extra = `is-style-${style}`;
  return current.includes(extra) ? current : `${current} ${extra}`.trim();
}

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
  private collections: { pluginId: string; schema: CollectionSchema }[] = [];
  private metaBoxes: MetaBox[] = [];
  private dashboard: DashboardWidget[] = [];
  private notices: AdminNotice[] = [];
  private forms: PluginForm[] = [];
  private graphqlTypes: GraphqlTypeDef[] = [];
  private graphqlFields: GraphqlFieldDef[] = [];

  clear(pluginId: string) {
    const keep = <T extends { pluginId: string }>(rows: T[]) => rows.filter((row) => row.pluginId !== pluginId);
    this.pages = keep(this.pages);
    this.widgets = keep(this.widgets);
    this.shortcodes = keep(this.shortcodes);
    this.blocks = keep(this.blocks);
    this.routes = keep(this.routes);
    this.assets = keep(this.assets);
    this.collections = keep(this.collections);
    this.metaBoxes = keep(this.metaBoxes);
    this.dashboard = keep(this.dashboard);
    this.notices = keep(this.notices);
    this.forms = keep(this.forms);
    this.graphqlTypes = keep(this.graphqlTypes);
    this.graphqlFields = keep(this.graphqlFields);
  }

  addPage(page: AdminPage) {
    if (!SLUG_RE.test(page.slug)) throw new Error('Admin page slug must be lowercase');
    this.pages = this.pages.filter((row) => !(row.pluginId === page.pluginId && row.slug === page.slug));
    this.pages.push({ ...page, screen: page.screen || 'form' });
  }

  addCollection(pluginId: string, schema: CollectionSchema) {
    this.collections = this.collections.filter((row) => !(row.pluginId === pluginId && row.schema.name === schema.name));
    this.collections.push({ pluginId, schema });
  }

  collection(pluginId: string, name: string) {
    return this.collections.find((row) => row.pluginId === pluginId && row.schema.name === name)?.schema ?? null;
  }

  addMetaBox(box: MetaBox) {
    if (!SLUG_RE.test(box.id)) throw new Error('Meta box id must be lowercase');
    this.metaBoxes = this.metaBoxes.filter((row) => !(row.pluginId === box.pluginId && row.id === box.id));
    this.metaBoxes.push(box);
  }

  addDashboard(widget: DashboardWidget) {
    this.dashboard = this.dashboard.filter((row) => !(row.pluginId === widget.pluginId && row.id === widget.id));
    this.dashboard.push(widget);
  }

  addForm(form: PluginForm) {
    if (!SLUG_RE.test(form.id)) throw new Error('Form id must be lowercase');
    this.forms = this.forms.filter((row) => !(row.pluginId === form.pluginId && row.id === form.id));
    this.forms.push(form);
  }

  form(pluginId: string, id: string) {
    return this.forms.find((row) => row.pluginId === pluginId && row.id === id) ?? null;
  }

  renderForm(pluginId: string, id: string) {
    const form = this.form(pluginId, id);
    if (!form) return '';
    const inputs = form.fields
      .map((field) => {
        const control =
          field.type === 'textarea'
            ? `<textarea name="${escapePluginText(field.key)}"></textarea>`
            : `<input name="${escapePluginText(field.key)}">`;
        return `<p><label>${escapePluginText(field.label)} ${control}</label></p>`;
      })
      .join('');
    return `<form method="post" action="/api/plugins/${escapePluginText(pluginId)}/forms/${escapePluginText(id)}">${inputs}<p><button type="submit">Send</button></p></form>`;
  }

  addNotice(notice: AdminNotice) {
    this.notices.push({ ...notice, message: notice.message.slice(0, 300) });
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
    this.routes.push({ ...route, method, auth: route.auth === true });
  }

  addGraphqlType(type: GraphqlTypeDef) {
    this.graphqlTypes = this.graphqlTypes.filter((row) => !(row.pluginId === type.pluginId && row.sdl === type.sdl));
    this.graphqlTypes.push(type);
  }

  addGraphqlField(field: GraphqlFieldDef) {
    this.graphqlFields = this.graphqlFields.filter(
      (row) => !(row.pluginId === field.pluginId && row.role === field.role && row.name === field.name),
    );
    this.graphqlFields.push(field);
  }

  graphqlExtensions() {
    return { types: this.graphqlTypes.map((row) => ({ ...row })), fields: this.graphqlFields.map((row) => ({ ...row })) };
  }

  addAsset(asset: PluginAsset) {
    this.assets = this.assets.filter(
      (row) => !(row.pluginId === asset.pluginId && row.handle === asset.handle && row.kind === asset.kind),
    );
    this.assets.push(asset);
  }

  adminPages() {
    return this.pages.map((page) => {
      const copy = { ...page };
      delete copy.entry;
      return copy;
    });
  }

  listMetaBoxes() {
    return this.metaBoxes.map(({ pluginId, id, title, postTypes, fields }) => ({ pluginId, id, title, postTypes, fields }));
  }

  listNotices() {
    return this.notices.map(({ pluginId, type, message }) => ({ pluginId, type, message }));
  }

  dashboardWidgets() {
    return this.dashboard.map(({ pluginId, id, title }) => ({ pluginId, id, title }));
  }

  async renderDashboard(pluginId: string, id: string) {
    const widget = this.dashboard.find((row) => row.pluginId === pluginId && row.id === id);
    if (!widget) return null;
    return kses(String(await widget.render()));
  }

  page(pluginId: string, slug: string) {
    return this.pages.find((page) => page.pluginId === pluginId && page.slug === slug) ?? null;
  }

  widgetTypes() {
    return this.widgets.map(({ pluginId, id, name }) => ({ pluginId, id, name, type: `${pluginId}/${id}` }));
  }

  blocksForEditor() {
    return this.blocks.map(({ pluginId, name, title, description, attributes, editor }) => ({
      pluginId,
      name,
      title,
      description,
      attributes: attributes ?? [],
      editor: Boolean(editor),
    }));
  }

  blockByName(name: string) {
    return this.blocks.find((block) => block.name === name) ?? null;
  }

  assetsForSite() {
    return this.assets.map(({ pluginId, href, kind, handle }) => ({ pluginId, href, kind, handle }));
  }

  assetFile(pluginId: string, file: string) {
    return this.assets.find((asset) => asset.pluginId === pluginId && asset.file === file) ?? null;
  }

  matchRoute(pluginId: string, method: string, path: string) {
    return (
      this.routes.find(
        (route) => route.pluginId === pluginId && route.method === method.toUpperCase() && route.path === path,
      ) ?? null
    );
  }

  async route(pluginId: string, method: string, path: string, query: Record<string, string>, body: unknown) {
    const found = this.matchRoute(pluginId, method, path);
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
        const raw = String(await shortcode.render(attrs));
        const marker = /^\{\{form:([a-z0-9-]+)\}\}$/.exec(raw.trim());
        const rendered = marker ? this.renderForm(shortcode.pluginId, marker[1]) : escapePluginText(raw);
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
        const record = block as { type?: string; props?: Record<string, unknown>; content?: unknown; children?: unknown };
        const blockName = record.type === 'pluginBlock' ? String(record.props?.name ?? '') : String(record.type ?? '');
        const pluginBlock = this.blocks.find((row) => row.name === blockName && row.render);
        let props = record.props;
        if (pluginBlock?.render) {
          const html = kses(String(await pluginBlock.render(record.props ?? {}))).slice(0, 20_000);
          const text = html.replace(/<[^>]+>/g, '');
          props = { ...(record.props ?? {}), html, text, className: styleClass(record.props) };
        }
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
        out.push({ ...record, props, content, children });
      }
      return out;
    };
    return walk(Array.isArray(blocks) ? blocks : []);
  }
}
