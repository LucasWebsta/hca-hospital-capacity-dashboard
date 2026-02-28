-- HCA Census Command — Azure SQL Schema
-- Run this in Azure Data Studio or the Azure Portal Query Editor

-- ─────────────────────────────────────────────
-- 1. Hospitals master table
-- ─────────────────────────────────────────────
CREATE TABLE dbo.Hospitals (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    name          NVARCHAR(100) NOT NULL,
    capacity      INT           NOT NULL,
    region        NVARCHAR(50)  NULL,
    created_at    DATETIME2     DEFAULT GETUTCDATE()
);

-- ─────────────────────────────────────────────
-- 2. Daily census snapshots
-- ─────────────────────────────────────────────
CREATE TABLE dbo.HospitalCensus (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    hospital_id    INT            NOT NULL REFERENCES dbo.Hospitals(id),
    census_date    DATE           NOT NULL,
    current_census INT            NOT NULL,
    occupancy_rate AS (CAST(current_census AS FLOAT) / NULLIF(
                        (SELECT capacity FROM dbo.Hospitals WHERE id = hospital_id), 0) * 100),
    created_at     DATETIME2      DEFAULT GETUTCDATE(),
    UNIQUE (hospital_id, census_date)
);
CREATE INDEX IX_HospitalCensus_Date ON dbo.HospitalCensus(census_date DESC);

-- ─────────────────────────────────────────────
-- 3. ML forecast results
-- ─────────────────────────────────────────────
CREATE TABLE dbo.ForecastData (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    hospital_id    INT            NULL REFERENCES dbo.Hospitals(id),  -- NULL = network-wide
    forecast_date  DATE           NOT NULL,
    predicted_census   INT        NOT NULL,
    confidence_lower   INT        NULL,
    confidence_upper   INT        NULL,
    model_version  NVARCHAR(20)   DEFAULT '1.0',
    created_at     DATETIME2      DEFAULT GETUTCDATE()
);
CREATE INDEX IX_ForecastData_Date ON dbo.ForecastData(forecast_date ASC);

-- ─────────────────────────────────────────────
-- 4. Alerts
-- ─────────────────────────────────────────────
CREATE TABLE dbo.Alerts (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    hospital_id    INT            NOT NULL REFERENCES dbo.Hospitals(id),
    severity       NVARCHAR(10)   NOT NULL CHECK (severity IN ('HIGH','MEDIUM','LOW','OK')),
    message        NVARCHAR(500)  NOT NULL,
    is_active      BIT            DEFAULT 1,
    triggered_at   DATETIME2      DEFAULT GETUTCDATE(),
    resolved_at    DATETIME2      NULL
);

-- ─────────────────────────────────────────────
-- 5. Seed demo data
-- ─────────────────────────────────────────────
INSERT INTO dbo.Hospitals (name, capacity, region) VALUES
  ('Central Regional',           452, 'Central'),
  ('HCA Westside',               223, 'West'),
  ('HCA Memorial Hospital East', 204, 'East'),
  ('HCA Northside',              171, 'North'),
  ('HCA Southside',              158, 'South');

-- Recent census
INSERT INTO dbo.HospitalCensus (hospital_id, census_date, current_census) VALUES
  (1, CAST(GETDATE() AS DATE), 428),
  (2, CAST(GETDATE() AS DATE), 201),
  (3, CAST(GETDATE() AS DATE), 180),
  (4, CAST(GETDATE() AS DATE), 139),
  (5, CAST(GETDATE() AS DATE), 124);

-- Forecast (next 7 days, network-wide)
INSERT INTO dbo.ForecastData (hospital_id, forecast_date, predicted_census, confidence_lower, confidence_upper) VALUES
  (NULL, DATEADD(DAY, 1, GETDATE()), 963,  940, 985),
  (NULL, DATEADD(DAY, 2, GETDATE()), 975,  950, 999),
  (NULL, DATEADD(DAY, 3, GETDATE()), 988,  961, 1015),
  (NULL, DATEADD(DAY, 4, GETDATE()), 994,  966, 1022),
  (NULL, DATEADD(DAY, 5, GETDATE()), 1001, 972, 1030),
  (NULL, DATEADD(DAY, 6, GETDATE()), 1003, 974, 1032),
  (NULL, DATEADD(DAY, 7, GETDATE()), 998,  969, 1027);

-- Alerts
INSERT INTO dbo.Alerts (hospital_id, severity, message) VALUES
  (2, 'HIGH', 'Occupancy exceeded 90% threshold'),
  (1, 'OK',   'Back below 95% capacity threshold');
