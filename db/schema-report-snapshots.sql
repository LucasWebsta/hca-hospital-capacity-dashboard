-- Report snapshots: save a point-in-time report for shareable links.
-- Run after users table exists.
-- Example: psql "YOUR_DATABASE_URL" -f schema-report-snapshots.sql

CREATE TABLE IF NOT EXISTS report_snapshots (
    id            TEXT PRIMARY KEY,
    user_id       INT NULL REFERENCES users(id) ON DELETE SET NULL,
    title         TEXT NULL,
    config        JSONB NOT NULL,
    data          JSONB NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_user ON report_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_created ON report_snapshots(created_at DESC);
