-- Per-site roles. Users stay network-wide. Super admins are networkAdmin, not every site administrator.

ALTER TABLE users ADD COLUMN IF NOT EXISTS "networkAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET "networkAdmin" = true WHERE role = 'ADMIN' AND "networkAdmin" = false;

CREATE TABLE IF NOT EXISTS site_users (
  "siteId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  role TEXT NOT NULL,
  CONSTRAINT site_users_pkey PRIMARY KEY ("siteId", "userId"),
  CONSTRAINT site_users_site_fkey FOREIGN KEY ("siteId") REFERENCES sites (id) ON DELETE CASCADE,
  CONSTRAINT site_users_user_fkey FOREIGN KEY ("userId") REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT site_users_role_check CHECK (role ~ '^[A-Z][A-Z0-9_]{0,40}$')
);

INSERT INTO site_users ("siteId", "userId", role)
SELECT 'site_main', id, role FROM users
ON CONFLICT ("siteId", "userId") DO NOTHING;

ALTER TABLE user_capabilities ADD COLUMN IF NOT EXISTS "siteId" TEXT NOT NULL DEFAULT 'site_main';
ALTER TABLE user_capabilities DROP CONSTRAINT IF EXISTS user_capabilities_pkey;
ALTER TABLE user_capabilities ADD CONSTRAINT user_capabilities_pkey PRIMARY KEY ("siteId", "userId", capability);
