import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// Helper function to generate simple forecast for predictive alerts
async function generateSimpleForecast(
  db: any,
  facilityId: number | null,
  days: number
): Promise<{ date: Date; predicted: number }[]> {
  const query = facilityId 
    ? `
      SELECT 
        (update_utc AT TIME ZONE 'UTC')::date AS census_date,
        COALESCE(total_census, 0)::int AS total
      FROM facility_metrics_wide
      WHERE facility_id = $1
        AND (update_utc AT TIME ZONE 'UTC')::date >=
            (SELECT (MAX(update_utc) AT TIME ZONE 'UTC')::date 
             FROM facility_metrics_wide 
             WHERE facility_id = $1) - INTERVAL '30 days'
      GROUP BY (update_utc AT TIME ZONE 'UTC')::date, total_census
      ORDER BY census_date ASC
    `
    : `
      SELECT 
        (update_utc AT TIME ZONE 'UTC')::date AS census_date,
        SUM(COALESCE(total_census, 0))::int AS total
      FROM facility_metrics_wide
      WHERE (update_utc AT TIME ZONE 'UTC')::date >=
          (SELECT (MAX(update_utc) AT TIME ZONE 'UTC')::date 
           FROM facility_metrics_wide) - INTERVAL '30 days'
      GROUP BY (update_utc AT TIME ZONE 'UTC')::date
      ORDER BY census_date ASC
    `;

  const { rows: historical } = await db.query(query, facilityId ? [facilityId] : []);
  
  if (historical.length < 2) return [];

  // Simple linear trend forecast
  const n = historical.length;
  const lastVal = Number(historical[n - 1].total);
  const prevVal = Number(historical[n - 2].total);
  const dailyDelta = (lastVal - prevVal) * 0.4; // Damped trend

  const forecasts: { date: Date; predicted: number }[] = [];
  const lastDate = new Date(historical[n - 1].census_date);

  for (let i = 1; i <= days; i++) {
    const forecastDate = new Date(lastDate);
    forecastDate.setDate(forecastDate.getDate() + i);
    forecasts.push({
      date: forecastDate,
      predicted: Math.round(lastVal + dailyDelta * i)
    });
  }

  return forecasts;
}

// GET /api/alerts
// Returns system-level threshold alerts (occupancy ≥ 75%) PLUS any user-defined
// alert rules (from alert_rules table) that are currently triggered against the
// latest facility_metrics values.  Pass X-User-Id header to include personal rules.
export async function alertsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
    const userId = request.headers.get('x-user-id');

    // ── 1. System-level threshold alerts from occupancy (using facility_metrics_wide) ──────────────────────
    const { rows: systemRows } = await db.query(`
      WITH latest_per_facility AS (
        SELECT facility_id, MAX(update_utc) AS max_ts
        FROM facility_metrics_wide
        WHERE total_census IS NOT NULL
        GROUP BY facility_id
      ),
      latest_vals AS (
        SELECT fmw.facility_id, fmw.total_census AS metric_value
        FROM facility_metrics_wide fmw
        JOIN latest_per_facility l ON fmw.facility_id = l.facility_id
          AND fmw.update_utc = l.max_ts
      ),
      occ AS (
        SELECT
          f.facility_id AS id,
          f.name,
          COALESCE(lv.metric_value, 0)                                               AS census,
          f.capacity,
          ROUND((COALESCE(lv.metric_value, 0)::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy_pct
        FROM facilities f
        LEFT JOIN latest_vals lv ON f.facility_id = lv.facility_id
      )
      SELECT
        id * 1000000 AS id,  -- Make system alerts have unique high IDs
        name AS hospital,
        CASE
          WHEN occupancy_pct >= 95 THEN 'HIGH'
          WHEN occupancy_pct >= 85 THEN 'MEDIUM'
          WHEN occupancy_pct >= 75 THEN 'LOW'
          ELSE 'OK'
        END AS severity,
        CASE
          WHEN occupancy_pct >= 95 THEN name || ' at critical capacity (' || occupancy_pct || '%)'
          WHEN occupancy_pct >= 85 THEN name || ' occupancy elevated (' || occupancy_pct || '%)'
          WHEN occupancy_pct >= 75 THEN name || ' approaching threshold (' || occupancy_pct || '%)'
          ELSE name || ' operating normally (' || occupancy_pct || '%)'
        END AS message,
        NOW() AS triggered_at,
        TRUE  AS is_active,
        'system' AS source
      FROM occ
      WHERE occupancy_pct >= 75
      ORDER BY occupancy_pct DESC
    `);

    // ── 2. User-defined rule alerts ───────────────────────────────────────────
    const userRows: typeof systemRows = [];

    if (userId) {
      // Load this user's rules (including predictive fields)
      const { rows: rules } = await db.query(
        `SELECT ar.id, ar.facility_id, f.name AS facility_name, ar.metric,
                ar.condition_type, ar.threshold_pct, ar.operator,
                ar.value_number, ar.window_minutes, f.capacity,
                COALESCE(ar.use_predictive, false) AS use_predictive,
                COALESCE(ar.forecast_horizon_days, 7) AS forecast_horizon_days
         FROM alert_rules ar
         JOIN facilities f ON f.facility_id = ar.facility_id
         WHERE ar.user_id = $1`,
        [userId]
      );

      for (const rule of rules) {
        try {
          // Check if this is a predictive rule
          const usePredictive = (rule as any).use_predictive === true;
          const forecastHorizon = (rule as any).forecast_horizon_days ?? 7;

          if (rule.condition_type === 'percent_occupancy' && rule.threshold_pct != null) {
            if (usePredictive) {
              // Check predicted values
              const forecasts = await generateSimpleForecast(db, rule.facility_id, forecastHorizon);
              for (const forecast of forecasts) {
                const predictedPct = rule.capacity > 0 ? (forecast.predicted / rule.capacity) * 100 : 0;
                if (predictedPct >= Number(rule.threshold_pct)) {
                  const daysAhead = Math.ceil((forecast.date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  userRows.push({
                    id: -(rule.id * 10000 + daysAhead * 100 + rule.facility_id), // unique ID for predictive alerts
                    hospital: rule.facility_name,
                    severity: predictedPct >= 95 ? 'HIGH' : predictedPct >= 85 ? 'MEDIUM' : 'LOW',
                    message: `[PREDICTIVE] ${rule.facility_name} predicted to reach ${predictedPct.toFixed(1)}% occupancy in ${daysAhead} day(s) (threshold: ${rule.threshold_pct}%)`,
                    triggered_at: new Date().toISOString(),
                    is_active: true,
                    source: 'predictive_rule',
                  });
                  break; // Only alert for first predicted breach
                }
              }
            } else {
              // Get latest total census for this facility (using facility_metrics_wide)
              const { rows: mv } = await db.query(
                `SELECT total_census AS metric_value FROM facility_metrics_wide
                 WHERE facility_id = $1 AND total_census IS NOT NULL
                 ORDER BY update_utc DESC LIMIT 1`,
                [rule.facility_id]
              );
              if (mv.length > 0) {
                const pct = rule.capacity > 0 ? (mv[0].metric_value / rule.capacity) * 100 : 0;
                if (pct >= Number(rule.threshold_pct)) {
                  userRows.push({
                    id: -(rule.id * 1000 + rule.facility_id), // unique negative ID for user rules
                    hospital: rule.facility_name,
                    severity: pct >= 95 ? 'HIGH' : pct >= 85 ? 'MEDIUM' : 'LOW',
                    message: `[Your rule] ${rule.facility_name} ${rule.metric} occupancy at ${pct.toFixed(1)}% (threshold: ${rule.threshold_pct}%)`,
                    triggered_at: new Date().toISOString(),
                    is_active: true,
                    source: 'user_rule',
                  });
                }
              }
            }
          } else if (rule.condition_type === 'value_threshold' && rule.operator && rule.value_number != null) {
            if (usePredictive) {
              // For value thresholds, check if predicted values will exceed threshold
              const forecasts = await generateSimpleForecast(db, rule.facility_id, forecastHorizon);
              for (const forecast of forecasts) {
                const threshold = Number(rule.value_number);
                let triggered = false;
                if (rule.operator === '>'  && forecast.predicted >  threshold) triggered = true;
                if (rule.operator === '>=' && forecast.predicted >= threshold) triggered = true;
                if (rule.operator === '<'  && forecast.predicted <  threshold) triggered = true;
                if (rule.operator === '<=' && forecast.predicted <= threshold) triggered = true;
                if (triggered) {
                  const daysAhead = Math.ceil((forecast.date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  userRows.push({
                    id: -(rule.id * 10000 + daysAhead * 100 + rule.facility_id + 5000), // unique ID for value threshold predictive alerts
                    hospital: rule.facility_name,
                    severity: 'MEDIUM',
                    message: `[PREDICTIVE] ${rule.facility_name} ${rule.metric} predicted to be ${forecast.predicted} (${rule.operator} ${threshold}) in ${daysAhead} day(s)`,
                    triggered_at: new Date().toISOString(),
                    is_active: true,
                    source: 'predictive_rule',
                  });
                  break;
                }
              }
            } else {
              // Get latest value for this facility + metric (using facility_metrics_wide)
              const metricField = rule.metric.toLowerCase() === 'total_census' || rule.metric.toLowerCase() === 'total census' 
                ? 'total_census'
                : rule.metric.toLowerCase() === 'icu_occupancy' || rule.metric.toLowerCase() === 'icu'
                  ? 'icu_occupancy'
                  : null;
              
              if (metricField) {
                const { rows: mv } = await db.query(
                  `SELECT ${metricField} AS metric_value FROM facility_metrics_wide
                   WHERE facility_id = $1 AND ${metricField} IS NOT NULL
                   ORDER BY update_utc DESC LIMIT 1`,
                  [rule.facility_id]
                );
                if (mv.length > 0) {
                  const val = Number(mv[0].metric_value);
                  const threshold = Number(rule.value_number);
                  let triggered = false;
                  if (rule.operator === '>'  && val >  threshold) triggered = true;
                  if (rule.operator === '>=' && val >= threshold) triggered = true;
                  if (rule.operator === '<'  && val <  threshold) triggered = true;
                  if (rule.operator === '<=' && val <= threshold) triggered = true;
                  if (triggered) {
                    userRows.push({
                      id: -(rule.id * 1000 + rule.facility_id + 2000), // unique negative ID for value threshold user rules
                      hospital: rule.facility_name,
                      severity: 'MEDIUM',
                      message: `[Your rule] ${rule.facility_name} ${rule.metric} is ${val} (${rule.operator} ${threshold})`,
                      triggered_at: new Date().toISOString(),
                      is_active: true,
                      source: 'user_rule',
                    });
                  }
                }
              }
            }
          } else if (rule.condition_type === 'surge_trend' && rule.window_minutes != null) {
            // Compare current value to value window_minutes ago (using facility_metrics_wide)
            const { rows: mv } = await db.query(
              `SELECT total_census AS metric_value, update_utc AS source_update_date 
               FROM facility_metrics_wide
               WHERE facility_id = $1 AND total_census IS NOT NULL
               ORDER BY update_utc DESC LIMIT 2`,
              [rule.facility_id]
            );
            if (mv.length >= 2) {
              const latest = Number(mv[0].metric_value);
              const previous = Number(mv[1].metric_value);
              const changePct = previous > 0 ? ((latest - previous) / previous) * 100 : 0;
              if (changePct >= 5) { // 5% surge threshold
                userRows.push({
                  id: -(rule.id * 1000 + rule.facility_id + 3000), // unique negative ID for surge trend user rules
                  hospital: rule.facility_name,
                  severity: changePct >= 15 ? 'HIGH' : 'MEDIUM',
                  message: `[Your rule] ${rule.facility_name} ${rule.metric} surged ${changePct.toFixed(1)}% recently`,
                  triggered_at: new Date().toISOString(),
                  is_active: true,
                  source: 'user_rule',
                });
              }
            }
          }
        } catch (ruleErr) {
          context.warn(`Failed to evaluate rule ${rule.id}:`, ruleErr);
        }
      }
    }

    const allAlerts = [...systemRows, ...userRows];

    return {
      jsonBody: allAlerts,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('alerts query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('alerts', { methods: ['GET'], authLevel: 'anonymous', handler: alertsHandler });
