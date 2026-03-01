-- Run this to enable custom alert rules on the Alerts page.
-- Uses your existing facilities table (facility_id).

CREATE TABLE IF NOT EXISTS alert_rules (
    id            SERIAL PRIMARY KEY,
    facility_id   INT         NOT NULL REFERENCES public.facilities (facility_id) ON DELETE CASCADE,
    metric        TEXT        NOT NULL,
    condition_type TEXT       NOT NULL CHECK (condition_type IN ('percent_occupancy','value_threshold','surge_trend')),
    threshold_pct  NUMERIC   NULL,
    operator       TEXT     NULL,
    value_number   NUMERIC   NULL,
    window_minutes INT       NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_facility ON alert_rules(facility_id);
