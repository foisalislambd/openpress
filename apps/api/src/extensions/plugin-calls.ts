import { CronService } from '../cron/cron.service';
import { CRON_HOOK } from '../cron/cron-schedule';
import { Db } from '../db/db.service';
import { newId } from '../db/ids';
import { isMachineSlug } from '../cms/publishing';
import { kses } from '../html/kses';
import { HooksService } from '../hooks/hooks.service';
import { currentSiteId } from '../sites/site-context';
import { CoreRegistry } from '../core/core-registry';
import { ExtensionRegistry } from './extension-registry';
import { PluginManifest } from './plugin-manifest';
import {
  CollectionSchema,
  compileCollectionFilter,
  parseCollectionSchema,
  sanitizeRecord,
} from './collections';

export const NOT_HANDLED = Symbol('not-handled');

const PRIVILEGED = new Set([
  'read',
  'edit_posts',
  'edit_others_posts',
  'publish_posts',
  'delete_posts',
  'delete_others_posts',
  'edit_pages',
  'publish_pages',
  'delete_pages',
  'moderate_comments',
  'upload_files',
  'manage_categories',
  'edit_theme_options',
  'activate_plugins',
  'manage_options',
  'list_users',
  'create_users',
  'edit_users',
  'delete_users',
  'manage_network',
  'manage_sites',
  'manage_network_users',
  'manage_network_options',
]);

const META_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/;
const STATUSES = new Set(['DRAFT', 'PENDING', 'PUBLISHED', 'SCHEDULED', 'TRASHED']);
const COMMENT_STATUSES = new Set(['PENDING', 'APPROVED', 'SPAM', 'TRASHED']);

export async function handlePluginCall(
  deps: {
    db: Db;
    hooks: HooksService;
    registry: ExtensionRegistry;
    core: CoreRegistry;
    cron: Pick<CronService, 'schedule'>;
    manifest: PluginManifest;
  },
  method: string,
  args: unknown[],
): Promise<unknown> {
  const pluginId = deps.manifest.id;
  if (method === 'data.define') {
    deps.registry.addCollection(pluginId, parseCollectionSchema(args[0]));
    return { defined: true };
  }
  if (method === 'data.insert' || method === 'data.find' || method === 'data.get' || method === 'data.update' || method === 'data.remove' || method === 'data.count') {
    return dataCall(deps.db, deps.registry, pluginId, method, args);
  }
  if (method === 'content.query') return contentQuery(deps.db, args[0]);
  if (method === 'content.meta') return contentMeta(deps.db, args[0], args[1], args[2]);
  if (method === 'content.types') return registerPostType(deps.db, args[0]);
  if (method === 'content.taxonomies') return registerTaxonomy(deps.db, args[0]);
  if (method === 'content.terms') return termCall(deps.db, args[0], args[1]);
  if (method === 'users.list' || method === 'users.get') return usersRead(deps.db, method, args);
  if (method === 'users.grant') return grantCapability(deps.db, deps.core, pluginId, args[0], args[1]);
  if (method === 'comments.list' || method === 'comments.create' || method === 'comments.moderate') {
    return commentCall(deps.db, deps.hooks, method, args);
  }
  if (method === 'media.list') return mediaList(deps.db, args[0]);
  if (method === 'cron.schedule') return schedule(deps.cron, pluginId, args[0]);
  if (method === 'cron.unschedule') return unschedule(deps.db, pluginId, args[0]);
  if (method === 'i18n.t' || method === 'i18n.load') return i18nCall(deps.db, pluginId, method, args);
  return NOT_HANDLED;
}

function schemaFor(registry: ExtensionRegistry, pluginId: string, name: string) {
  const schema = registry.collection(pluginId, name);
  if (!schema) throw new Error(`Collection "${name}" is not defined`);
  return schema;
}

async function dataCall(db: Db, registry: ExtensionRegistry, pluginId: string, method: string, args: unknown[]) {
  const name = String(args[0] ?? '');
  const schema = schemaFor(registry, pluginId, name);
  if (method === 'data.insert') {
    const data = sanitizeRecord(schema, args[1], false);
    const id = newId();
    await db.query(
      `INSERT INTO plugin_records (id, "pluginId", collection, data) VALUES ($1, $2, $3, $4::jsonb)`,
      [id, pluginId, schema.name, JSON.stringify(data)],
    );
    return { id, data };
  }
  if (method === 'data.get') {
    return db.one(
      `SELECT id, data, "createdAt", "updatedAt" FROM plugin_records WHERE "pluginId" = $1 AND collection = $2 AND id = $3`,
      [pluginId, schema.name, String(args[1] ?? '').slice(0, 80)],
    );
  }
  if (method === 'data.update') {
    const patch = sanitizeRecord(schema, args[2], true);
    const row = await db.one(
      `UPDATE plugin_records
       SET data = data || $4::jsonb, "updatedAt" = now()
       WHERE "pluginId" = $1 AND collection = $2 AND id = $3
       RETURNING id, data, "updatedAt"`,
      [pluginId, schema.name, String(args[1] ?? '').slice(0, 80), JSON.stringify(patch)],
    );
    if (!row) throw new Error('Record not found');
    return row;
  }
  if (method === 'data.remove') {
    const row = await db.one(
      `DELETE FROM plugin_records WHERE "pluginId" = $1 AND collection = $2 AND id = $3 RETURNING id`,
      [pluginId, schema.name, String(args[1] ?? '').slice(0, 80)],
    );
    return { deleted: Boolean(row) };
  }
  const filter = compileCollectionFilter(schema, args[1], 3);
  const params = [pluginId, schema.name, ...filter.params];
  if (method === 'data.count') {
    const row = await db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM plugin_records WHERE "pluginId" = $1 AND collection = $2 AND ${filter.sql}`,
      params,
    );
    return { count: row?.count ?? 0 };
  }
  return db.query(
    `SELECT id, data, "createdAt", "updatedAt"
     FROM plugin_records
     WHERE "pluginId" = $1 AND collection = $2 AND ${filter.sql}
     ORDER BY ${filter.orderSql}
     LIMIT ${filter.limit} OFFSET ${filter.offset}`,
    params,
  );
}

async function contentQuery(db: Db, raw: unknown) {
  const query = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const postType = typeof query.postType === 'string' && /^[a-z0-9-]{1,40}$/.test(query.postType) ? query.postType : '';
  const type = query.type === 'PAGE' ? 'PAGE' : query.type === 'POST' ? 'POST' : '';
  const status = typeof query.status === 'string' && STATUSES.has(query.status) ? query.status : '';
  const search = typeof query.search === 'string' ? query.search.slice(0, 80) : '';
  const limit = Math.min(50, Math.max(1, Number.isInteger(query.limit) ? Number(query.limit) : 20));
  return db.query(
    `SELECT id, type, "postType", status, visibility, title, slug, excerpt, "updatedAt"
     FROM contents
     WHERE "siteId" = $1
       AND ($2 = '' OR "postType" = $2)
       AND ($3 = '' OR type = $3::"ContentType")
       AND ($4 = '' OR status = $4::"ContentStatus")
       AND ($5 = '' OR title ILIKE '%' || $5 || '%')
     ORDER BY "updatedAt" DESC
     LIMIT $6`,
    [currentSiteId(), postType, type, status, search, limit],
  );
}

async function contentMeta(db: Db, contentId: unknown, key: unknown, value: unknown) {
  const id = String(contentId ?? '').slice(0, 80);
  const metaKey = String(key ?? '');
  if (!META_KEY.test(metaKey) || metaKey.startsWith('_')) throw new Error('Invalid meta key');
  if (value === undefined) {
    const row = await db.one<{ value: unknown }>(
      `SELECT "metaValue" AS value FROM content_meta WHERE "contentId" = $1 AND "metaKey" = $2`,
      [id, metaKey],
    );
    return row?.value ?? null;
  }
  if (value === null) {
    await db.query('DELETE FROM content_meta WHERE "contentId" = $1 AND "metaKey" = $2', [id, metaKey]);
    return { deleted: true };
  }
  const json = JSON.stringify(value);
  if (json.length > 10_000) throw new Error('Meta value is too large');
  await db.query(
    `INSERT INTO content_meta (id, "contentId", "metaKey", "metaValue")
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT ("contentId", "metaKey") DO UPDATE SET "metaValue" = EXCLUDED."metaValue"`,
    [newId(), id, metaKey, json],
  );
  return { key: metaKey, value };
}

async function registerPostType(db: Db, raw: unknown) {
  const input = objectArg(raw);
  const slug = String(input.slug ?? '').trim().toLowerCase();
  if (!isMachineSlug(slug, ['post', 'page', 'attachment', 'revision', 'nav_menu_item'])) {
    throw new Error('Post type slug must be lowercase and not reserved');
  }
  const label = String(input.label ?? '').trim().slice(0, 80);
  if (!label) throw new Error('Label is required');
  const row = await db.one(
    `INSERT INTO post_types (slug, label, singular, description, public, hierarchical, "hasArchive", supports, builtin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, false)
     ON CONFLICT (slug) DO NOTHING
     RETURNING slug, label`,
    [
      slug,
      label,
      String(input.singular || label).slice(0, 80),
      input.description ? String(input.description).slice(0, 300) : null,
      input.public !== false,
      input.hierarchical === true,
      input.hasArchive !== false,
      JSON.stringify(stringList(input.supports, ['title', 'editor', 'excerpt'])),
    ],
  );
  return row ?? { slug, label, existed: true };
}

async function registerTaxonomy(db: Db, raw: unknown) {
  const input = objectArg(raw);
  const slug = String(input.slug ?? '').trim().toLowerCase();
  if (!isMachineSlug(slug, ['category', 'post_tag'])) throw new Error('Taxonomy slug must be lowercase and not reserved');
  const label = String(input.label ?? '').trim().slice(0, 80);
  if (!label) throw new Error('Label is required');
  const row = await db.one(
    `INSERT INTO taxonomies (slug, label, singular, hierarchical, public, "postTypes", builtin)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, false)
     ON CONFLICT (slug) DO NOTHING
     RETURNING slug, label`,
    [
      slug,
      label,
      String(input.singular || label).slice(0, 80),
      input.hierarchical === true,
      input.public !== false,
      JSON.stringify(stringList(input.postTypes, ['post'])),
    ],
  );
  return row ?? { slug, label, existed: true };
}

async function termCall(db: Db, action: unknown, raw: unknown) {
  const input = objectArg(raw);
  if (action === 'list') {
    const taxonomy = String(input.taxonomy ?? '');
    if (!/^[a-z0-9-]{1,40}$/.test(taxonomy)) throw new Error('Invalid taxonomy');
    return db.query(
      `SELECT id, taxonomy, name, slug FROM terms WHERE taxonomy = $1 ORDER BY name ASC LIMIT 100`,
      [taxonomy],
    );
  }
  if (action === 'create') {
    const taxonomy = String(input.taxonomy ?? '');
    const name = String(input.name ?? '').trim().slice(0, 80);
    if (!/^[a-z0-9-]{1,40}$/.test(taxonomy) || !name) throw new Error('Taxonomy and name are required');
    const slug = (String(input.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'term').slice(0, 80);
    return db.one(
      `INSERT INTO terms (id, taxonomy, name, slug, description) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, taxonomy, name, slug`,
      [newId(), taxonomy, name, slug, input.description ? String(input.description).slice(0, 300) : null],
    );
  }
  const contentId = String(input.contentId ?? '').slice(0, 80);
  const termIds = stringList(input.termIds, []).slice(0, 30);
  await db.query('DELETE FROM content_terms WHERE "contentId" = $1', [contentId]);
  if (termIds.length) {
    await db.query(
      `INSERT INTO content_terms ("contentId", "termId")
       SELECT $1, id FROM terms WHERE id = ANY($2::text[])`,
      [contentId, termIds],
    );
  }
  return { contentId, termIds };
}

async function usersRead(db: Db, method: string, args: unknown[]) {
  if (method === 'users.get') {
    return db.one(
      `SELECT id, email, name, role FROM users WHERE id = $1`,
      [String(args[0] ?? '').slice(0, 80)],
    );
  }
  const query = objectArg(args[0]);
  const search = typeof query.search === 'string' ? query.search.slice(0, 80) : '';
  return db.query(
    `SELECT id, email, name, role FROM users
     WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
     ORDER BY name ASC
     LIMIT 50`,
    [search],
  );
}

async function grantCapability(
  db: Db,
  core: CoreRegistry,
  pluginId: string,
  userId: unknown,
  capability: unknown,
) {
  const cap = String(capability ?? '');
  const owned = core.capabilitiesFor().filter((item) => item.source === pluginId).map((item) => item.name);
  if (!owned.includes(cap) || PRIVILEGED.has(cap)) {
    throw new Error('A plugin can grant only a non-core capability it registered');
  }
  const id = String(userId ?? '').slice(0, 80);
  const user = await db.one('SELECT id FROM users WHERE id = $1', [id]);
  if (!user) throw new Error('User not found');
  await db.query(
    `INSERT INTO user_capabilities ("siteId", "userId", capability, granted)
     VALUES ($1, $2, $3, true)
     ON CONFLICT ("siteId", "userId", capability) DO UPDATE SET granted = true`,
    [currentSiteId(), id, cap],
  );
  return { userId: id, capability: cap, granted: true };
}

async function commentCall(db: Db, hooks: HooksService, method: string, args: unknown[]) {
  if (method === 'comments.list') {
    const query = objectArg(args[0]);
    const contentId = typeof query.contentId === 'string' ? query.contentId.slice(0, 80) : '';
    const status = typeof query.status === 'string' && COMMENT_STATUSES.has(query.status) ? query.status : '';
    return db.query(
      `SELECT id, "contentId", "guestName", "guestEmail", body, status, "createdAt"
       FROM comments
       WHERE ($1 = '' OR "contentId" = $1)
         AND ($2 = '' OR status = $2::"CommentStatus")
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      [contentId, status],
    );
  }
  if (method === 'comments.create') {
    const input = objectArg(args[0]);
    const contentId = String(input.contentId ?? '').slice(0, 80);
    const body = kses(String(input.body ?? '')).slice(0, 5000);
    if (!contentId || !body) throw new Error('contentId and body are required');
    const row = await db.one(
      `INSERT INTO comments (id, "contentId", "guestName", "guestEmail", body, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING id, "contentId", status`,
      [newId(), contentId, String(input.name ?? 'Plugin').slice(0, 80), String(input.email ?? '').slice(0, 200), body],
    );
    await hooks.doAction('comment.created', row);
    return row;
  }
  const input = objectArg(args[0]);
  const status = String(input.status ?? '');
  if (!COMMENT_STATUSES.has(status)) throw new Error('Invalid comment status');
  const row = await db.one(
    `UPDATE comments SET status = $2::"CommentStatus" WHERE id = $1 RETURNING id, status, "contentId"`,
    [String(input.id ?? '').slice(0, 80), status],
  );
  if (!row) throw new Error('Comment not found');
  await hooks.doAction('comment.status_changed', row);
  return row;
}

async function mediaList(db: Db, raw: unknown) {
  const limit = Math.min(50, Math.max(1, Number(objectArg(raw).limit ?? 20) || 20));
  return db.query(
    `SELECT id, filename, url, "mimeType", alt, width, height, "createdAt"
     FROM media
     WHERE "siteId" = $1
     ORDER BY "createdAt" DESC
     LIMIT $2`,
    [currentSiteId(), limit],
  );
}

async function schedule(cron: Pick<CronService, 'schedule'>, pluginId: string, raw: unknown) {
  const input = objectArg(raw);
  const hook = namespacedHook(pluginId, String(input.hook ?? ''));
  const intervalSeconds = input.intervalSeconds == null ? null : Math.floor(Number(input.intervalSeconds));
  const scheduled = await cron.schedule({
    hook,
    intervalSeconds,
    args: scalarList(input.args),
  });
  return { ...scheduled, hook };
}

async function unschedule(db: Db, pluginId: string, raw: unknown) {
  const hook = namespacedHook(pluginId, String(raw ?? ''));
  const rows = await db.query(`DELETE FROM cron_events WHERE hook = $1 RETURNING id`, [hook]);
  return { hook, removed: rows.length };
}

async function i18nCall(db: Db, pluginId: string, method: string, args: unknown[]) {
  const domain = `plugin:${pluginId}`;
  if (method === 'i18n.t') {
    const input = objectArg(args[0]);
    const msgid = String(input.message ?? args[0] ?? '').slice(0, 500);
    const locale = localeOf(input.locale);
    const row = await db.one<{ msgstr: string }>(
      `SELECT msgstr FROM gettext_entries WHERE locale = $1 AND domain = $2 AND msgid = $3`,
      [locale, domain, msgid],
    );
    return row?.msgstr || msgid;
  }
  const input = objectArg(args[0]);
  const locale = localeOf(input.locale);
  const messages = input.messages && typeof input.messages === 'object' ? (input.messages as Record<string, unknown>) : {};
  const entries = Object.entries(messages).slice(0, 200);
  for (const [msgid, msgstr] of entries) {
    if (typeof msgid !== 'string' || typeof msgstr !== 'string') continue;
    await db.query(
      `INSERT INTO gettext_entries (locale, domain, context, msgid, msgstr)
       VALUES ($1, $2, '', $3, $4)
       ON CONFLICT (locale, domain, context, msgid) DO UPDATE SET msgstr = EXCLUDED.msgstr`,
      [locale, domain, msgid.slice(0, 500), msgstr.slice(0, 500)],
    );
  }
  return { locale, count: entries.length };
}

export function namespacedHook(pluginId: string, hook: string) {
  const suffix = hook.trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 60);
  const full = suffix.startsWith(`${pluginId}.`) ? suffix : `${pluginId}.${suffix}`;
  if (!suffix || !CRON_HOOK.test(full) || !full.startsWith(`${pluginId}.`)) throw new Error('Invalid cron hook');
  return full;
}

export function collectionFromRegistration(raw: unknown): CollectionSchema {
  return parseCollectionSchema(raw);
}

function objectArg(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === 'string' && item.length < 80).slice(0, 12);
}

function scalarList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).filter((item) => ['string', 'number', 'boolean'].includes(typeof item));
}

function localeOf(value: unknown) {
  const locale = typeof value === 'string' ? value : 'en';
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) throw new Error('Invalid locale');
  return locale;
}
