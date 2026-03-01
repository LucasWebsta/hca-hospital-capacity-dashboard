import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// Map metric display name → facility_metrics_wide column
function metricToColumn(metric: string): string {
  const m = (metric || '').toLowerCase();
  if (m.includes('admiss'))   return 'admissions';
  if (m.includes('discharg')) return 'discharges';
  if (m.includes('birth'))    return 'births';
  if (m.includes('icu'))      return 'icu_occupancy';
  return 'total_census';
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

    // ── 1. System-level threshold alerts from occupancy ──────────────────────
    const { rows: systemRows } = await db.query(`
      WITH latest AS (
        SELECT DISTINCT ON (facility_id)
          facility_id, total_census AS census
        FROM facility_metrics_wide
        ORDER BY facility_id, update_utc DESC
      ),
      occ AS (
        SELECT
          f.facility_id AS id,
          f.name,
          COALESCE(l.census, 0)                                                        AS census,
          f.capacity,
          ROUND((COALESCE(l.census, 0)::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy_pct
        FROM facilities f
        LEFT JOIN latest l ON f.facility_id = l.facility_id
      )
      SELECT
        id,
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
      // Load this user's rules
      const { rows: rules } = await db.query(
        `SELECT ar.id, ar.facility_id, f.name AS facility_name, ar.metric,
                ar.condition_type, ar.threshold_pct, ar.operator,
                ar.value_number, ar.window_minutes, f.capacity
         FROM alert_rules ar
         JOIN facilities f ON f.facility_id = ar.facility_id
         WHERE ar.user_id = $1`,
        [userId]
      );

      for (const rule of rules) {
        try {
          if (rule.condition_type === 'percent_occupancy' && rule.threshold_pct != null) {
            // Get latest total census for this facility
            const { rows: mv } = await db.query(
              `SELECT total_census AS metric_value FROM facility_metrics_wide
               WHERE facility_id = $1
               ORDER BY update_utc DESC LIMIT 1`,
              [rule.facility_id]
            );
            if (mv.length > 0) {
              const pct = rule.capacity > 0 ? (mv[0].metric_value / rule.capacity) * 100 : 0;
              if (pct >= Number(rule.threshold_pct)) {
                userRows.push({
                  id: rule.id * -1, // negative to avoid ID collision
                  hospital: rule.facility_name,
                  severity: pct >= 95 ? 'HIGH' : pct >= 85 ? 'MEDIUM' : 'LOW',
                  message: `[Your rule] ${rule.facility_name} ${rule.metric} occupancy at ${pct.toFixed(1)}% (threshold: ${rule.threshold_pct}%)`,
                  triggered_at: new Date().toISOString(),
                  is_active: true,
                  source: 'user_rule',
                });
              }
            }
          } else if (rule.condition_type === 'value_threshold' && rule.operator && rule.value_number != null) {
            // Get latest value for this facility + metric (map display name to column)
            const col = metricToColumn(rule.metric as string);
            const { rows: mv } = await db.query(
              `SELECT ${col} AS metric_value FROM facility_metrics_wide
               WHERE facility_id = $1
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
                  id: rule.id * -1,
                  hospital: rule.facility_name,
                  severity: 'MEDIUM',
                  message: `[Your rule] ${rule.facility_name} ${rule.metric} is ${val} (${rule.operator} ${threshold})`,
                  triggered_at: new Date().toISOString(),
                  is_active: true,
                  source: 'user_rule',
                });
              }
            }
          } else if (rule.condition_type === 'surge_trend' && rule.window_minutes != null) {
            // Compare latest two readings for surge detection
            const surgeCol = metricToColumn(rule.metric as string);
            const { rows: mv } = await db.query(
              `SELECT ${surgeCol} AS metric_value FROM facility_metrics_wide
               WHERE facility_id = $1
               ORDER BY update_utc DESC LIMIT 2`,
              [rule.facility_id]
            );
            if (mv.length >= 2) {
              const latest = Number(mv[0].metric_value);
              const previous = Number(mv[1].metric_value);
              const changePct = previous > 0 ? ((latest - previous) / previous) * 100 : 0;
              if (changePct >= 5) { // 5% surge threshold
                userRows.push({
                  id: rule.id * -1,
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
