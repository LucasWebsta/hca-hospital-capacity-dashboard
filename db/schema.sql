-- HCA Census Command — PostgreSQL / Neon Schema
-- Paste this entire file into the Neon SQL Editor at console.neon.tech and run it

-- ─────────────────────────────────────────────
-- 1. Hospitals master table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
    id         SERIAL PRIMARY KEY,
    name       TEXT        NOT NULL,
    capacity   INT         NOT NULL,
    region     TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. Daily census snapshots
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospital_census (
    id             SERIAL PRIMARY KEY,
    hospital_id    INT         NOT NULL REFERENCES hospitals(id),
    census_date    DATE        NOT NULL,
    current_census INT         NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (hospital_id, census_date)
);
CREATE INDEX IF NOT EXISTS idx_census_date ON hospital_census(census_date DESC);

-- ─────────────────────────────────────────────
-- 3. ML forecast results
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forecast_data (
    id               SERIAL PRIMARY KEY,
    hospital_id      INT   REFERENCES hospitals(id),  -- NULL = network-wide
    forecast_date    DATE        NOT NULL,
    predicted_census INT         NOT NULL,
    confidence_lower INT,
    confidence_upper INT,
    model_version    TEXT        DEFAULT '1.0',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecast_date ON forecast_data(forecast_date ASC);

-- ─────────────────────────────────────────────
-- 4. Alerts
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id           SERIAL PRIMARY KEY,
    hospital_id  INT         NOT NULL REFERENCES hospitals(id),
    severity     TEXT        NOT NULL CHECK (severity IN ('HIGH','MEDIUM','LOW','OK')),
    message      TEXT        NOT NULL,
    is_active    BOOLEAN     DEFAULT TRUE,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- 5. Seed demo data
-- ─────────────────────────────────────────────
INSERT INTO hospitals (name, capacity, region) VALUES
  ('Central Regional',           452, 'Central'),
  ('HCA Westside',               223, 'West'),
  ('HCA Memorial Hospital East', 204, 'East'),
  ('HCA Northside',              171, 'North'),
  ('HCA Southside',              158, 'South')
ON CONFLICT DO NOTHING;

-- Today's census
INSERT INTO hospital_census (hospital_id, census_date, current_census) VALUES
  (1, CURRENT_DATE, 428),
  (2, CURRENT_DATE, 201),
  (3, CURRENT_DATE, 180),
  (4, CURRENT_DATE, 139),
  (5, CURRENT_DATE, 124)
ON CONFLICT (hospital_id, census_date) DO NOTHING;

-- Historical trend (30 days of data for Hospital 1 as network proxy)
INSERT INTO hospital_census (hospital_id, census_date, current_census)
SELECT 1, CURRENT_DATE - s, (820 + s * 4)::int
FROM generate_series(30, 1, -1) s
ON CONFLICT DO NOTHING;

-- Forecasts (network-wide, next 7 days)
INSERT INTO forecast_data (hospital_id, forecast_date, predicted_census, confidence_lower, confidence_upper) VALUES
  (NULL, CURRENT_DATE + 1, 963,  940, 985),
  (NULL, CURRENT_DATE + 2, 975,  950, 999),
  (NULL, CURRENT_DATE + 3, 988,  961, 1015),
  (NULL, CURRENT_DATE + 4, 994,  966, 1022),
  (NULL, CURRENT_DATE + 5, 1001, 972, 1030),
  (NULL, CURRENT_DATE + 6, 1003, 974, 1032),
  (NULL, CURRENT_DATE + 7, 998,  969, 1027)
ON CONFLICT DO NOTHING;

-- Alerts
INSERT INTO alerts (hospital_id, severity, message) VALUES
  (2, 'HIGH', 'Occupancy exceeded 90% threshold'),
  (1, 'OK',   'Back below 95% capacity threshold')
ON CONFLICT DO NOTHING;



