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
      WITH latest AS (
        SELECT DISTINCT ON (facility_id)
          facility_id, total_census AS census, update_utc AS latest_ts
        FROM facility_metrics_wide
        ORDER BY facility_id, update_utc DESC
      ),
      prev AS (
        SELECT DISTINCT ON (fw.facility_id)
          fw.facility_id, fw.total_census AS prev_census
        FROM facility_metrics_wide fw
        JOIN latest l ON l.facility_id = fw.facility_id
        WHERE fw.update_utc < l.latest_ts
        ORDER BY fw.facility_id, fw.update_utc DESC
      )
      SELECT
        f.facility_id,
        f.name,
        COALESCE(l.census, 0)::int AS census,
        ROUND((COALESCE(l.census, 0)::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy,
        f.capacity,
        CASE
          WHEN COALESCE(l.census, 0) > COALESCE(p.prev_census, l.census, 0) THEN 'up'
          WHEN COALESCE(l.census, 0) < COALESCE(p.prev_census, l.census, 0) THEN 'down'
          ELSE 'flat'
        END AS trend
      FROM facilities f
      LEFT JOIN latest l ON f.facility_id = l.facility_id
      LEFT JOIN prev p ON f.facility_id = p.facility_id
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
