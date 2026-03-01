import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/census
export async function censusHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();

    // facilities + facility_metrics: total census from metric 'Total Census' (or total/census/etc.)
    const { rows } = await db.query(`
      WITH census_metrics AS (
        SELECT facility_id, source_update_date, metric_value,
               ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY
                 source_update_date DESC,
                 CASE WHEN LOWER(metric) = 'total census' THEN 0 WHEN LOWER(metric) = 'total' THEN 1 WHEN LOWER(metric) = 'census' THEN 2 ELSE 3 END
               ) AS rn
        FROM facility_metrics
        WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
      ),
      latest_vals AS (
        SELECT facility_id, metric_value
        FROM census_metrics
        WHERE rn = 1
      ),
      totals AS (
        SELECT
          COALESCE(SUM(lv.metric_value), 0)::int AS total_census,
          COALESCE(SUM(f.capacity), 0)::int     AS total_capacity
        FROM facilities f
        LEFT JOIN latest_vals lv ON f.facility_id = lv.facility_id
      ),
      latest_icu AS (
        SELECT facility_id, MAX(source_update_date) AS max_ts
        FROM facility_metrics
        WHERE LOWER(metric) = 'icu'
        GROUP BY facility_id
      ),
      icu_vals AS (
        SELECT fm.facility_id, fm.metric_value
        FROM facility_metrics fm
        JOIN latest_icu l ON fm.facility_id = l.facility_id
          AND fm.source_update_date = l.max_ts AND LOWER(fm.metric) = 'icu'
      ),
      icu_total AS (
        SELECT COALESCE(SUM(metric_value), 0)::int AS total FROM icu_vals
      ),
      recent_avg AS (
        SELECT ROUND(AVG(daily_total))::int AS avg_census
        FROM (
          SELECT (source_update_date AT TIME ZONE 'UTC')::date AS d, SUM(metric_value)::int AS daily_total
          FROM facility_metrics
          WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
            AND source_update_date >= (SELECT MAX(source_update_date) FROM facility_metrics WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')) - INTERVAL '7 days'
          GROUP BY (source_update_date AT TIME ZONE 'UTC')::date
        ) d
      )
      SELECT
        t.total_census     AS "totalCensus",
        t.total_capacity   AS "totalCapacity",
        ROUND((t.total_census::numeric / NULLIF(t.total_capacity, 0)) * 100, 1) AS "occupancyRate",
        (SELECT COALESCE(ROUND(avg_census * 1.015)::int, t.total_census) FROM recent_avg) AS "sevenDayForecast",
        (SELECT total FROM icu_total) AS "icuTotal"
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
