-- Query depth, term and comment meta, transients, edit locks, and a multisite foundation.
-- The primary site is seeded. Existing rows belong to it. Roles stay network-wide.

CREATE TABLE sites (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'public',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sites_pkey PRIMARY KEY (id),
  CONSTRAINT sites_slug_unique UNIQUE (slug),
  CONSTRAINT sites_status_check CHECK (status IN ('public', 'archived'))
);

INSERT INTO sites (id, name, slug, domain, path)
VALUES ('site_main', 'Primary', 'primary', '', '/')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE site_options (
  "siteId" TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  autoload BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT site_options_pkey PRIMARY KEY ("siteId", key),
  CONSTRAINT site_options_site_fkey FOREIGN KEY ("siteId") REFERENCES sites (id) ON DELETE CASCADE
);

ALTER TABLE contents ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE terms ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE media ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE nav_menus ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE widget_instances ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE rewrite_rules ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';

ALTER TABLE contents DROP CONSTRAINT IF EXISTS contents_site_fkey;
ALTER TABLE contents ADD CONSTRAINT contents_site_fkey FOREIGN KEY ("siteId") REFERENCES sites (id);
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_site_fkey;
ALTER TABLE categories ADD CONSTRAINT categories_site_fkey FOREIGN KEY ("siteId") REFERENCES sites (id);
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_site_fkey;
ALTER TABLE tags ADD CONSTRAINT tags_site_fkey FOREIGN KEY ("siteId") REFERENCES sites (id);
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_site_fkey;
ALTER TABLE media ADD CONSTRAINT media_site_fkey FOREIGN KEY ("siteId") REFERENCES sites (id);

DROP INDEX IF EXISTS "contents_slug_key";
DROP INDEX IF EXISTS "categories_slug_key";
DROP INDEX IF EXISTS "tags_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS contents_site_slug_key ON contents ("siteId", slug);
CREATE UNIQUE INDEX IF NOT EXISTS categories_site_slug_key ON categories ("siteId", slug);
CREATE UNIQUE INDEX IF NOT EXISTS tags_site_slug_key ON tags ("siteId", slug);

ALTER TABLE terms DROP CONSTRAINT IF EXISTS terms_taxonomy_slug_unique;
ALTER TABLE terms DROP CONSTRAINT IF EXISTS terms_site_taxonomy_slug;
ALTER TABLE terms ADD CONSTRAINT terms_site_taxonomy_slug UNIQUE ("siteId", taxonomy, slug);

ALTER TABLE nav_menus DROP CONSTRAINT IF EXISTS nav_menus_slug_unique;
ALTER TABLE nav_menus ADD CONSTRAINT nav_menus_site_slug UNIQUE ("siteId", slug);

ALTER TABLE rewrite_rules DROP CONSTRAINT IF EXISTS rewrite_rules_pattern_unique;
ALTER TABLE rewrite_rules ADD CONSTRAINT rewrite_rules_site_pattern UNIQUE ("siteId", pattern);

ALTER TABLE menu_locations ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE menu_locations DROP CONSTRAINT IF EXISTS menu_locations_pkey;
ALTER TABLE menu_locations ADD CONSTRAINT menu_locations_pkey PRIMARY KEY ("siteId", location);

CREATE TABLE term_meta (
  id TEXT NOT NULL,
  "termKind" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "metaKey" TEXT NOT NULL,
  "metaValue" JSONB NOT NULL,
  CONSTRAINT term_meta_pkey PRIMARY KEY (id),
  CONSTRAINT term_meta_unique UNIQUE ("termKind", "termId", "metaKey"),
  CONSTRAINT term_meta_kind_check CHECK ("termKind" IN ('category', 'tag', 'term'))
);

CREATE TABLE comment_meta (
  id TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "metaKey" TEXT NOT NULL,
  "metaValue" JSONB NOT NULL,
  CONSTRAINT comment_meta_pkey PRIMARY KEY (id),
  CONSTRAINT comment_meta_unique UNIQUE ("commentId", "metaKey"),
  CONSTRAINT comment_meta_comment_fkey FOREIGN KEY ("commentId") REFERENCES comments (id) ON DELETE CASCADE
);

CREATE TABLE transients (
  "siteId" TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  "expiresAt" TIMESTAMPTZ,
  CONSTRAINT transients_pkey PRIMARY KEY ("siteId", key)
);

CREATE TABLE content_locks (
  "contentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT content_locks_pkey PRIMARY KEY ("contentId"),
  CONSTRAINT content_locks_content_fkey FOREIGN KEY ("contentId") REFERENCES contents (id) ON DELETE CASCADE,
  CONSTRAINT content_locks_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);
