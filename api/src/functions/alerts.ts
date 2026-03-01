import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/alerts
export async function alertsHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();

    // Derive from facilities + latest facility_metrics (metric='total') occupancy
    const { rows } = await db.query(`
      WITH latest_per_facility AS (
        SELECT facility_id, MAX(source_update_date) AS max_ts
        FROM facility_metrics
        WHERE LOWER(metric) IN ('total census', 'total')
        GROUP BY facility_id
      ),
      latest_vals AS (
        SELECT fm.facility_id, fm.metric_value
        FROM facility_metrics fm
        JOIN latest_per_facility l ON fm.facility_id = l.facility_id
          AND fm.source_update_date = l.max_ts AND LOWER(fm.metric) IN ('total census', 'total')
      ),
      occ AS (
        SELECT
          f.facility_id AS id,
          f.name,
          ROUND((COALESCE(lv.metric_value, 0)::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy_pct
        FROM facilities f
        LEFT JOIN latest_vals lv ON f.facility_id = lv.facility_id
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
        TRUE  AS is_active
      FROM occ
      WHERE occupancy_pct >= 75
      ORDER BY occupancy_pct DESC
    `);
    return {
      jsonBody: rows,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('alerts query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('alerts', { methods: ['GET'], authLevel: 'anonymous', handler: alertsHandler });
