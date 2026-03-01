import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/census
export async function censusHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();

    // facility_metrics_wide: sum latest total_census + icu_occupancy per facility
    const { rows } = await db.query(`
      WITH latest AS (
        SELECT DISTINCT ON (facility_id)
          facility_id, total_census, icu_occupancy
        FROM facility_metrics_wide
        ORDER BY facility_id, update_utc DESC
      ),
      totals AS (
        SELECT
          COALESCE(SUM(l.total_census), 0)::int AS total_census,
          COALESCE(SUM(f.capacity), 0)::int     AS total_capacity,
          COALESCE(SUM(l.icu_occupancy), 0)::int AS icu_total
        FROM facilities f
        LEFT JOIN latest l ON f.facility_id = l.facility_id
      ),
      recent_avg AS (
        SELECT ROUND(AVG(daily_total))::int AS avg_census
        FROM (
          SELECT (update_utc AT TIME ZONE 'UTC')::date AS d, SUM(total_census)::int AS daily_total
          FROM facility_metrics_wide
          WHERE update_utc >= (SELECT MAX(update_utc) FROM facility_metrics_wide) - INTERVAL '7 days'
          GROUP BY (update_utc AT TIME ZONE 'UTC')::date
        ) d
      )
      SELECT
        t.total_census   AS "totalCensus",
        t.total_capacity AS "totalCapacity",
        ROUND((t.total_census::numeric / NULLIF(t.total_capacity, 0)) * 100, 1) AS "occupancyRate",
        COALESCE(ROUND((SELECT avg_census FROM recent_avg) * 1.015)::int, t.total_census) AS "sevenDayForecast",
        t.icu_total      AS "icuTotal"
      FROM totals t
    `);
    return {
      jsonBody: rows[0],
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('census query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('census', { methods: ['GET'], authLevel: 'anonymous', handler: censusHandler });
