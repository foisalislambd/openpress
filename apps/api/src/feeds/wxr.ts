export interface WxrTerm {
  slug: string;
  name: string;
}

export interface WxrItem {
  title: string;
  slug: string;
  type: 'POST' | 'PAGE';
  status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'TRASHED';
  visibility: 'PUBLIC' | 'PRIVATE' | 'PASSWORD';
  excerpt: string;
  blocks: unknown[];
  categories: WxrTerm[];
  tags: WxrTerm[];
  password?: string;
  sticky?: boolean;
  wpId?: string;
  author?: string;
  date?: string;
  link?: string;
  featuredId?: string;
  meta?: { key: string; value: string }[];
  comments?: { author: string; email: string; content: string; date: string; approved: boolean }[];
}

export interface WxrAttachment {
  wpId: string;
  url: string;
  title: string;
  filename: string;
}

export interface WxrMenuItem {
  title: string;
  url: string;
  order: number;
}

export interface WxrBundle {
  items: WxrItem[];
  attachments: WxrAttachment[];
  menuItems: WxrMenuItem[];
}

const BLOCK_MARK = 'openpress-blocks:';

export function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cdata(value: string) {
  return `<![CDATA[${value.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function tag(source: string, name: string) {
  const match = source.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!match) return '';
  return decodeXml(stripCdata(match[1].trim()));
}

function stripCdata(value: string) {
  const match = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return match ? match[1] : value;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function mapStatus(status: string, password: string): Pick<WxrItem, 'status' | 'visibility'> {
  const normalized = status.toLowerCase();
  if (password) {
    return {
      status: normalized === 'future' ? 'SCHEDULED' : normalized === 'draft' ? 'DRAFT' : 'PUBLISHED',
      visibility: 'PASSWORD',
    };
  }
  switch (normalized) {
    case 'publish':
      return { status: 'PUBLISHED', visibility: 'PUBLIC' };
    case 'private':
      return { status: 'PUBLISHED', visibility: 'PRIVATE' };
    case 'future':
      return { status: 'SCHEDULED', visibility: 'PUBLIC' };
    case 'trash':
      return { status: 'TRASHED', visibility: 'PUBLIC' };
    default:
      return { status: 'DRAFT', visibility: 'PUBLIC' };
  }
}

function blocksFromEncoded(encoded: string): unknown[] {
  const match = encoded.match(/<!--\s*openpress-blocks:([A-Za-z0-9+/=_-]+)\s*-->/);
  if (match) {
    try {
      const parsed = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to a paragraph */
    }
  }
  const text = encoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return [{ type: 'paragraph', content: [{ type: 'text', text: text.slice(0, 10000) }] }];
}

function terms(itemXml: string, domain: string): WxrTerm[] {
  const found: WxrTerm[] = [];
  const re = new RegExp(
    `<category([^>]*)domain="${domain}"([^>]*)>([\\s\\S]*?)</category>`,
    'gi',
  );
  for (const match of itemXml.matchAll(re)) {
    const attrs = `${match[1]} ${match[2]}`;
    const nice = attrs.match(/nicename="([^"]*)"/i)?.[1] ?? '';
    const name = decodeXml(stripCdata(match[3].trim())) || nice;
    const slug = decodeXml(nice) || name;
    if (slug) found.push({ slug, name });
  }
  return found;
}

function postMeta(raw: string) {
  const meta: { key: string; value: string }[] = [];
  for (const match of raw.matchAll(/<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/gi)) {
    const key = tag(match[1], 'wp:meta_key');
    const value = tag(match[1], 'wp:meta_value');
    if (key) meta.push({ key, value });
  }
  return meta;
}

function commentsOf(raw: string): NonNullable<WxrItem['comments']> {
  const comments: NonNullable<WxrItem['comments']> = [];
  for (const match of raw.matchAll(/<wp:comment>([\s\S]*?)<\/wp:comment>/gi)) {
    const approved = tag(match[1], 'wp:comment_approved');
    comments.push({
      author: tag(match[1], 'wp:comment_author'),
      email: tag(match[1], 'wp:comment_author_email'),
      content: tag(match[1], 'wp:comment_content'),
      date: tag(match[1], 'wp:comment_date'),
      approved: approved === '1',
    });
  }
  return comments;
}

export function parseWxrBundle(xml: string): WxrBundle {
  const items: WxrItem[] = [];
  const attachments: WxrAttachment[] = [];
  const menuItems: WxrMenuItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const raw = match[1];
    const postType = tag(raw, 'wp:post_type') || 'post';
    const title = tag(raw, 'title') || 'Untitled';
    const wpId = tag(raw, 'wp:post_id');
    if (postType === 'attachment') {
      const url = tag(raw, 'wp:attachment_url');
      if (url) attachments.push({ wpId, url, title, filename: url.split('/').pop() || 'file' });
      continue;
    }
    if (postType === 'nav_menu_item') {
      const meta = postMeta(raw);
      const url = meta.find((row) => row.key === '_menu_item_url')?.value || tag(raw, 'link');
      if (title && url) menuItems.push({ title, url, order: Number(tag(raw, 'wp:menu_order') || 0) });
      continue;
    }
    if (postType !== 'post' && postType !== 'page') continue;
    const slug = tag(raw, 'wp:post_name') || title;
    const password = tag(raw, 'wp:post_password');
    const mapped = mapStatus(tag(raw, 'wp:status') || 'draft', password);
    const meta = postMeta(raw);
    items.push({
      title,
      slug,
      type: postType === 'page' ? 'PAGE' : 'POST',
      status: mapped.status,
      visibility: mapped.visibility,
      excerpt: tag(raw, 'excerpt:encoded'),
      blocks: blocksFromEncoded(tag(raw, 'content:encoded')),
      categories: terms(raw, 'category'),
      tags: terms(raw, 'post_tag'),
      password: password || undefined,
      sticky: tag(raw, 'wp:is_sticky') === '1',
      wpId: wpId || undefined,
      author: tag(raw, 'dc:creator') || undefined,
      date: tag(raw, 'wp:post_date') || undefined,
      link: tag(raw, 'link') || undefined,
      featuredId: meta.find((row) => row.key === '_thumbnail_id')?.value,
      meta,
      comments: commentsOf(raw),
    });
  }
  return { items, attachments, menuItems };
}

export function parseWxr(xml: string): WxrItem[] {
  return parseWxrBundle(xml).items;
}

export function buildWxr(input: {
  siteTitle: string;
  siteUrl: string;
  items: WxrItem[];
}) {
  const siteUrl = input.siteUrl.replace(/\/$/, '');
  const body = input.items
    .map((item) => {
      const encoded = blocksToEncoded(item.blocks);
      const wpStatus =
        item.visibility === 'PRIVATE'
          ? 'private'
          : item.status === 'PUBLISHED'
            ? 'publish'
            : item.status === 'SCHEDULED'
              ? 'future'
              : item.status === 'TRASHED'
                ? 'trash'
                : 'draft';
      const cats = item.categories
        .map(
          (term) =>
            `<category domain="category" nicename="${xmlEscape(term.slug)}">${cdata(term.name)}</category>`,
        )
        .join('');
      const tags = item.tags
        .map(
          (term) =>
            `<category domain="post_tag" nicename="${xmlEscape(term.slug)}">${cdata(term.name)}</category>`,
        )
        .join('');
      return `<item>
<title>${xmlEscape(item.title)}</title>
<link>${xmlEscape(`${siteUrl}/${item.slug}`)}</link>
<wp:post_id>${xmlEscape(item.wpId ?? '')}</wp:post_id>
<dc:creator>${cdata(item.author ?? '')}</dc:creator>
<wp:post_date>${xmlEscape(item.date ?? '')}</wp:post_date>
<wp:post_name>${xmlEscape(item.slug)}</wp:post_name>
<wp:post_type>${item.type === 'PAGE' ? 'page' : 'post'}</wp:post_type>
<wp:status>${wpStatus}</wp:status>
<wp:post_password>${xmlEscape(item.password ?? '')}</wp:post_password>
<wp:is_sticky>${item.sticky ? '1' : '0'}</wp:is_sticky>
<excerpt:encoded>${cdata(item.excerpt)}</excerpt:encoded>
<content:encoded>${cdata(encoded)}</content:encoded>
${cats}${tags}
</item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
<title>${xmlEscape(input.siteTitle)}</title>
<link>${xmlEscape(siteUrl)}</link>
<description>OpenPress WXR export</description>
<wp:wxr_version>1.2</wp:wxr_version>
${body}
</channel>
</rss>`;
}

export function blocksToEncoded(blocks: unknown[]) {
  const marker = `<!--${BLOCK_MARK}${Buffer.from(JSON.stringify(blocks ?? [])).toString('base64url')}-->`;
  const text = plainText(blocks);
  return text ? `${marker}\n${text}` : marker;
}

function plainText(blocks: unknown[]): string {
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const content = (block as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const node of content) {
        if (node && typeof node === 'object' && 'text' in node && typeof node.text === 'string') {
          parts.push(node.text);
        }
      }
    }
  }
  return parts.join(' ').trim();
}
