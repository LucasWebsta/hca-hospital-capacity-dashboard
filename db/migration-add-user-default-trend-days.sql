-- Add default date filter (trend days) and phone_number to users for existing databases.
-- Run once after users_schema.sql or when adding this feature to an existing DB.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_trend_days INTEGER DEFAULT 30;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Notification preferences for alert delivery (email/SMS)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT true;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN DEFAULT false;
