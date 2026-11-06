-- Custom roles, user meta, autoload options, durable cron, menus, widgets, rewrite rules.
-- users.role becomes text so a role can be added without altering a Postgres enum.

ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'AUTHOR';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_slug_check;
ALTER TABLE users ADD CONSTRAINT users_role_slug_check CHECK (role ~ '^[A-Z][A-Z0-9_]{0,40}$');

CREATE TABLE roles (
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  builtin BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roles_pkey PRIMARY KEY (slug)
);

INSERT INTO roles (slug, label, capabilities, builtin) VALUES
  ('ADMIN', 'Administrator', ARRAY[
    'read','edit_posts','edit_others_posts','publish_posts','delete_posts','delete_others_posts',
    'edit_pages','publish_pages','delete_pages','moderate_comments','upload_files','manage_categories',
    'edit_theme_options','activate_plugins','manage_options','list_users','create_users','edit_users','delete_users'
  ], true),
  ('EDITOR', 'Editor', ARRAY[
    'read','edit_posts','edit_others_posts','publish_posts','delete_posts','delete_others_posts',
    'edit_pages','publish_pages','delete_pages','moderate_comments','upload_files','manage_categories','edit_theme_options'
  ], true),
  ('AUTHOR', 'Author', ARRAY[
    'read','edit_posts','publish_posts','delete_posts','upload_files','manage_categories'
  ], true),
  ('CONTRIBUTOR', 'Contributor', ARRAY['read','edit_posts','delete_posts'], true),
  ('SUBSCRIBER', 'Subscriber', ARRAY['read'], true)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE user_capabilities (
  "userId" TEXT NOT NULL,
  capability TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  CONSTRAINT user_capabilities_pkey PRIMARY KEY ("userId", capability),
  CONSTRAINT user_capabilities_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE user_meta (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "metaKey" TEXT NOT NULL,
  "metaValue" JSONB NOT NULL,
  CONSTRAINT user_meta_pkey PRIMARY KEY (id),
  CONSTRAINT user_meta_user_key UNIQUE ("userId", "metaKey"),
  CONSTRAINT user_meta_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX user_meta_key_idx ON user_meta ("metaKey");

ALTER TABLE settings ADD COLUMN autoload BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE cron_events (
  id TEXT NOT NULL,
  hook TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '[]'::jsonb,
  "nextRunAt" TIMESTAMPTZ NOT NULL,
  "intervalSeconds" INTEGER,
  "lockedUntil" TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cron_events_pkey PRIMARY KEY (id),
  CONSTRAINT cron_interval_check CHECK ("intervalSeconds" IS NULL OR "intervalSeconds" >= 15)
);

CREATE INDEX cron_due_idx ON cron_events ("nextRunAt");

CREATE TABLE nav_menus (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nav_menus_pkey PRIMARY KEY (id),
  CONSTRAINT nav_menus_slug_unique UNIQUE (slug)
);

CREATE TABLE nav_menu_items (
  id TEXT NOT NULL,
  "menuId" TEXT NOT NULL,
  "parentId" TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  "objectId" TEXT,
  target TEXT NOT NULL DEFAULT '',
  CONSTRAINT nav_menu_items_pkey PRIMARY KEY (id),
  CONSTRAINT nav_menu_items_menu_fkey FOREIGN KEY ("menuId") REFERENCES nav_menus (id) ON DELETE CASCADE,
  CONSTRAINT nav_menu_items_parent_fkey FOREIGN KEY ("parentId") REFERENCES nav_menu_items (id) ON DELETE CASCADE,
  CONSTRAINT nav_item_type_check CHECK (type IN ('custom', 'post', 'page', 'category', 'tag'))
);

CREATE INDEX nav_menu_items_menu_idx ON nav_menu_items ("menuId", position);

CREATE TABLE menu_locations (
  location TEXT NOT NULL,
  "menuId" TEXT,
  CONSTRAINT menu_locations_pkey PRIMARY KEY (location),
  CONSTRAINT menu_locations_menu_fkey FOREIGN KEY ("menuId") REFERENCES nav_menus (id) ON DELETE SET NULL
);

INSERT INTO menu_locations (location, "menuId") VALUES ('primary', NULL), ('footer', NULL)
ON CONFLICT (location) DO NOTHING;

CREATE TABLE widget_instances (
  id TEXT NOT NULL,
  area TEXT NOT NULL,
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT widget_instances_pkey PRIMARY KEY (id),
  CONSTRAINT widget_area_check CHECK (area IN ('sidebar', 'footer'))
);

CREATE INDEX widget_instances_area_idx ON widget_instances (area, position);

CREATE TABLE rewrite_rules (
  id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  query JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'custom',
  priority INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rewrite_rules_pkey PRIMARY KEY (id),
  CONSTRAINT rewrite_rules_pattern_unique UNIQUE (pattern)
);
