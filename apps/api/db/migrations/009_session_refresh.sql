ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS "refreshHash" TEXT;
