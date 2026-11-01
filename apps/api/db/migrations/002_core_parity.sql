-- WordPress-shaped publishing, media derivatives, custom fields, and app passwords.
-- New enum labels are not used in this file (PostgreSQL cannot use a value
-- added in the same transaction).

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CONTRIBUTOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUBSCRIBER';

ALTER TABLE contents
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN sticky BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commentStatus" TEXT NOT NULL DEFAULT 'open';

ALTER TABLE contents
  ADD CONSTRAINT contents_visibility_check
    CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'PASSWORD')),
  ADD CONSTRAINT contents_comment_status_check
    CHECK ("commentStatus" IN ('open', 'closed'));

CREATE INDEX contents_scheduled_idx
  ON contents ("scheduledAt")
  WHERE status = 'SCHEDULED';

CREATE INDEX contents_visibility_idx ON contents (visibility);

CREATE INDEX contents_search_idx
  ON contents
  USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '')));

CREATE TABLE content_meta (
  id TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "metaKey" TEXT NOT NULL,
  "metaValue" JSONB NOT NULL,
  CONSTRAINT content_meta_pkey PRIMARY KEY (id),
  CONSTRAINT content_meta_content_key UNIQUE ("contentId", "metaKey"),
  CONSTRAINT content_meta_content_fkey FOREIGN KEY ("contentId") REFERENCES contents(id) ON DELETE CASCADE
);

CREATE INDEX content_meta_key_idx ON content_meta ("metaKey");

CREATE TABLE autosaves (
  id TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  title TEXT NOT NULL,
  blocks JSONB NOT NULL,
  excerpt TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT autosaves_pkey PRIMARY KEY (id),
  CONSTRAINT autosaves_content_author UNIQUE ("contentId", "authorId"),
  CONSTRAINT autosaves_content_fkey FOREIGN KEY ("contentId") REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT autosaves_author_fkey FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE media
  ADD COLUMN caption TEXT,
  ADD COLUMN sizes JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE application_passwords (
  id TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT application_passwords_pkey PRIMARY KEY (id),
  CONSTRAINT application_passwords_user_fkey FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX application_passwords_user_idx ON application_passwords ("userId");
CREATE INDEX application_passwords_prefix_idx ON application_passwords (prefix);

ALTER TABLE comments
  ADD COLUMN "authorIp" TEXT,
  ADD COLUMN "userAgent" TEXT;

CREATE INDEX comments_content_status_idx ON comments ("contentId", status);
