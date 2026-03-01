import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/alerts
export async function alertsHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();

    // Derive alerts dynamically from occupancy on the most recent census date
    const { rows } = await db.query(`
      WITH latest AS (
        SELECT MAX(census_date) AS max_date FROM hospital_census
      ),
      occ AS (
        SELECT
          h.id,
          h.name,
          ROUND((hc.current_census::numeric / NULLIF(h.capacity, 0)) * 100, 1) AS occupancy_pct
        FROM hospital_census hc
        JOIN hospitals h ON hc.hospital_id = h.id
        WHERE hc.census_date = (SELECT max_date FROM latest)
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
