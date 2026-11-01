-- Sandbox storage, package trust, import jobs, redirects, and audit log.

CREATE TABLE plugin_storage (
  "pluginId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  value JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plugin_storage_pkey PRIMARY KEY ("pluginId", "key")
);

CREATE TABLE trusted_keys (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trusted_keys_pkey PRIMARY KEY (id),
  CONSTRAINT trusted_keys_public_unique UNIQUE ("publicKey")
);

CREATE TABLE plugin_releases (
  id TEXT NOT NULL,
  "pluginId" TEXT NOT NULL,
  version TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "signatureStatus" TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plugin_releases_pkey PRIMARY KEY (id)
);

CREATE INDEX plugin_releases_plugin_idx ON plugin_releases ("pluginId", "createdAt" DESC);

CREATE TABLE jobs (
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  result JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jobs_pkey PRIMARY KEY (id),
  CONSTRAINT jobs_status_check CHECK (status IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED'))
);

CREATE INDEX jobs_type_idx ON jobs (type, "createdAt" DESC);

CREATE TABLE redirects (
  id TEXT NOT NULL,
  "fromPath" TEXT NOT NULL,
  "toPath" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL DEFAULT 301,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT redirects_pkey PRIMARY KEY (id),
  CONSTRAINT redirects_from_unique UNIQUE ("fromPath"),
  CONSTRAINT redirects_status_check CHECK ("statusCode" IN (301, 302, 307, 308))
);

CREATE TABLE audit_log (
  id TEXT NOT NULL,
  "actorId" TEXT,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

CREATE INDEX audit_log_created_idx ON audit_log ("createdAt" DESC);

CREATE TABLE outbound_mail (
  id TEXT NOT NULL,
  "pluginId" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outbound_mail_pkey PRIMARY KEY (id)
);

CREATE INDEX outbound_mail_plugin_idx ON outbound_mail ("pluginId", "createdAt" DESC);
