-- Add default date filter (trend days) to users for existing databases.
-- Run once after users_schema.sql or when adding this feature to an existing DB.

-- Add column if it doesn't exist (PostgreSQL 9.5+)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_trend_days INTEGER DEFAULT 30;
