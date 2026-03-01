import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/facilities
export async function facilitiesHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
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
      ranked AS (
        SELECT facility_id, metric_value, source_update_date,
               ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY source_update_date DESC) AS rn
        FROM facility_metrics
        WHERE LOWER(metric) IN ('total census', 'total')
      ),
      prev_vals AS (
        SELECT facility_id, metric_value AS prev_val
        FROM ranked
        WHERE rn = 2
      )
      SELECT
        f.name,
        COALESCE(lv.metric_value, 0)::int AS census,
        ROUND((COALESCE(lv.metric_value, 0)::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy,
        f.capacity,
        CASE
          WHEN COALESCE(lv.metric_value, 0) > COALESCE(pv.prev_val, lv.metric_value, 0) THEN 'up'
          WHEN COALESCE(lv.metric_value, 0) < COALESCE(pv.prev_val, lv.metric_value, 0) THEN 'down'
          ELSE 'flat'
        END AS trend
      FROM facilities f
      LEFT JOIN latest_vals lv ON f.facility_id = lv.facility_id
      LEFT JOIN prev_vals pv ON f.facility_id = pv.facility_id
      ORDER BY occupancy DESC NULLS LAST
      LIMIT 5
    `);
    return {
      jsonBody: rows,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('facilities query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('facilities', { methods: ['GET'], authLevel: 'anonymous', handler: facilitiesHandler });
