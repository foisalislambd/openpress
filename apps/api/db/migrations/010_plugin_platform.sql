-- Plugin-owned records, one-shot migrations, and install state.
-- Plugins never receive a SQL connection. Core writes these tables for them.

CREATE TABLE IF NOT EXISTS plugin_records (
  id TEXT PRIMARY KEY,
  "pluginId" TEXT NOT NULL,
  collection TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plugin_records_lookup ON plugin_records ("pluginId", collection);

CREATE TABLE IF NOT EXISTS plugin_migrations (
  "pluginId" TEXT NOT NULL,
  version TEXT NOT NULL,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("pluginId", version)
);

CREATE TABLE IF NOT EXISTS plugin_state (
  "pluginId" TEXT PRIMARY KEY,
  installed BOOLEAN NOT NULL DEFAULT false,
  "installedVersion" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
