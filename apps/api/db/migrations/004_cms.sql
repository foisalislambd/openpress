-- Content modeling, translations, auth factors, jobs payload, media focus, mail.

ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'PENDING';

ALTER TABLE contents
  ADD COLUMN IF NOT EXISTS "postType" TEXT NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "translationGroup" TEXT;

UPDATE contents SET "postType" = 'page' WHERE type = 'PAGE' AND "postType" = 'post';

CREATE INDEX IF NOT EXISTS contents_post_type_idx ON contents ("postType", status);
CREATE INDEX IF NOT EXISTS contents_locale_idx ON contents (locale);
CREATE INDEX IF NOT EXISTS contents_translation_idx ON contents ("translationGroup");

CREATE TABLE IF NOT EXISTS post_types (
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  singular TEXT NOT NULL,
  description TEXT,
  public BOOLEAN NOT NULL DEFAULT true,
  hierarchical BOOLEAN NOT NULL DEFAULT false,
  "hasArchive" BOOLEAN NOT NULL DEFAULT true,
  supports JSONB NOT NULL DEFAULT '["title","editor","excerpt","thumbnail"]'::jsonb,
  builtin BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_types_pkey PRIMARY KEY (slug)
);

INSERT INTO post_types (slug, label, singular, public, hierarchical, "hasArchive", builtin)
VALUES
  ('post', 'Posts', 'Post', true, false, true, true),
  ('page', 'Pages', 'Page', true, true, false, true)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS taxonomies (
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  singular TEXT NOT NULL,
  hierarchical BOOLEAN NOT NULL DEFAULT false,
  public BOOLEAN NOT NULL DEFAULT true,
  "postTypes" JSONB NOT NULL DEFAULT '["post"]'::jsonb,
  builtin BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT taxonomies_pkey PRIMARY KEY (slug)
);

INSERT INTO taxonomies (slug, label, singular, hierarchical, public, "postTypes", builtin)
VALUES
  ('category', 'Categories', 'Category', true, true, '["post"]'::jsonb, true),
  ('post_tag', 'Tags', 'Tag', false, true, '["post"]'::jsonb, true)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS terms (
  id TEXT NOT NULL,
  taxonomy TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  "parentId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT terms_pkey PRIMARY KEY (id),
  CONSTRAINT terms_taxonomy_fkey FOREIGN KEY (taxonomy) REFERENCES taxonomies (slug) ON DELETE CASCADE,
  CONSTRAINT terms_taxonomy_slug_unique UNIQUE (taxonomy, slug)
);

CREATE INDEX IF NOT EXISTS terms_taxonomy_idx ON terms (taxonomy);

CREATE TABLE IF NOT EXISTS content_terms (
  "contentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  CONSTRAINT content_terms_pkey PRIMARY KEY ("contentId", "termId"),
  CONSTRAINT content_terms_content_fkey FOREIGN KEY ("contentId") REFERENCES contents (id) ON DELETE CASCADE,
  CONSTRAINT content_terms_term_fkey FOREIGN KEY ("termId") REFERENCES terms (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_groups (
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  "postTypes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  position TEXT NOT NULL DEFAULT 'normal',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT field_groups_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS field_definitions (
  id TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  label TEXT NOT NULL,
  "fieldType" TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT field_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT field_definitions_group_fkey FOREIGN KEY ("groupId") REFERENCES field_groups (id) ON DELETE CASCADE,
  CONSTRAINT field_definitions_key_unique UNIQUE ("groupId", "fieldKey")
);

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patterns_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userAgent" TEXT,
  ip TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "revokedAt" TIMESTAMPTZ,
  CONSTRAINT user_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_sessions_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions ("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS user_totp (
  "userId" TEXT NOT NULL,
  secret TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_totp_pkey PRIMARY KEY ("userId"),
  CONSTRAINT user_totp_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT webauthn_credentials_id_unique UNIQUE ("credentialId"),
  CONSTRAINT webauthn_credentials_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT NOT NULL,
  "userId" TEXT,
  email TEXT,
  kind TEXT NOT NULL,
  challenge TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS oauth_identities (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  provider TEXT NOT NULL,
  "providerUserId" TEXT NOT NULL,
  email TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT oauth_identities_pkey PRIMARY KEY (id),
  CONSTRAINT oauth_identities_provider_unique UNIQUE (provider, "providerUserId"),
  CONSTRAINT oauth_identities_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT oauth_codes_pkey PRIMARY KEY (id),
  CONSTRAINT oauth_codes_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  "lastUsedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys (prefix);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '["content.published"]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhooks_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  event TEXT NOT NULL,
  status INTEGER,
  error TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT webhook_deliveries_webhook_fkey FOREIGN KEY ("webhookId") REFERENCES webhooks (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS i18n_strings (
  locale TEXT NOT NULL,
  "stringKey" TEXT NOT NULL,
  value TEXT NOT NULL,
  CONSTRAINT i18n_strings_pkey PRIMARY KEY (locale, "stringKey")
);

CREATE TABLE IF NOT EXISTS mail_queue (
  id TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mail_queue_pkey PRIMARY KEY (id),
  CONSTRAINT mail_queue_status_check CHECK (status IN ('QUEUED', 'SENT', 'FAILED'))
);

ALTER TABLE media
  ADD COLUMN IF NOT EXISTS "focalX" REAL NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS "focalY" REAL NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
