-- Add predictive alert rule support to alert_rules table
-- This enables alerts based on predicted occupancy/capacity values, not just current values

-- Add columns for predictive alerts
ALTER TABLE alert_rules 
  ADD COLUMN IF NOT EXISTS use_predictive BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS forecast_horizon_days INT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS confidence_level NUMERIC DEFAULT 0.80;

-- Add check constraint for forecast_horizon_days (reasonable range)
ALTER TABLE alert_rules
  DROP CONSTRAINT IF EXISTS check_forecast_horizon_days;

ALTER TABLE alert_rules
  ADD CONSTRAINT check_forecast_horizon_days 
  CHECK (forecast_horizon_days >= 1 AND forecast_horizon_days <= 60);

-- Add check constraint for confidence_level (0.0 to 1.0)
ALTER TABLE alert_rules
  DROP CONSTRAINT IF EXISTS check_confidence_level;

ALTER TABLE alert_rules
  ADD CONSTRAINT check_confidence_level 
  CHECK (confidence_level >= 0.0 AND confidence_level <= 1.0);

-- Update condition_type to include predictive_occupancy option
ALTER TABLE alert_rules
  DROP CONSTRAINT IF EXISTS alert_rules_condition_type_check;

ALTER TABLE alert_rules
  ADD CONSTRAINT alert_rules_condition_type_check 
  CHECK (condition_type IN ('percent_occupancy','value_threshold','surge_trend','predictive_occupancy','predictive_capacity'));

-- Add index for faster queries on predictive rules
CREATE INDEX IF NOT EXISTS idx_alert_rules_predictive 
ON alert_rules(use_predictive, forecast_horizon_days) 
WHERE use_predictive = true;

-- Comments for documentation
COMMENT ON COLUMN alert_rules.use_predictive IS 'If true, alert is based on predicted values from forecast model instead of current values';
COMMENT ON COLUMN alert_rules.forecast_horizon_days IS 'Number of days ahead to check predictions (1-60)';
COMMENT ON COLUMN alert_rules.confidence_level IS 'Confidence level for predictions (0.0-1.0), e.g., 0.80 for 80% confidence interval';

