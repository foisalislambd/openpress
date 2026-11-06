-- Gettext-style messages, reusable blocks, and attachment terms.

CREATE TABLE IF NOT EXISTS gettext_entries (
  locale TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'openpress',
  context TEXT NOT NULL DEFAULT '',
  msgid TEXT NOT NULL,
  "msgidPlural" TEXT NOT NULL DEFAULT '',
  msgstr TEXT NOT NULL DEFAULT '',
  "msgstrPlural" TEXT NOT NULL DEFAULT '',
  CONSTRAINT gettext_entries_pkey PRIMARY KEY (locale, domain, context, msgid)
);

CREATE TABLE IF NOT EXISTS reusable_blocks (
  id TEXT NOT NULL,
  "siteId" TEXT NOT NULL DEFAULT 'site_main',
  title TEXT NOT NULL,
  blocks JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reusable_blocks_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS media_terms (
  "mediaId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  CONSTRAINT media_terms_pkey PRIMARY KEY ("mediaId", "termId"),
  CONSTRAINT media_terms_media_fkey FOREIGN KEY ("mediaId") REFERENCES media (id) ON DELETE CASCADE,
  CONSTRAINT media_terms_term_fkey FOREIGN KEY ("termId") REFERENCES terms (id) ON DELETE CASCADE
);
