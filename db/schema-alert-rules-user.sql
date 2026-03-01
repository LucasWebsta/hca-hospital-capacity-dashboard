-- Run this after schema-alert-rules.sql to scope alert rules to the logged-in user.
-- Requires: users table and alert_rules table.
--
-- From project root or db folder, run against your Neon (or Postgres) DB, e.g.:
--   psql "YOUR_DATABASE_URL" -f schema-alert-rules-user.sql
-- Or in Neon SQL Editor: paste and run the statements below.

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS user_id INT NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id);

COMMENT ON COLUMN alert_rules.user_id IS 'Owner of this rule; NULL for legacy rules (not shown when filtering by user).';
