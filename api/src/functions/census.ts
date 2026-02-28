import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/census
export async function censusHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();

    // Use the most recent available date (not CURRENT_DATE, in case data lags)
    const { rows } = await db.query(`
      WITH latest AS (
        SELECT MAX(census_date) AS max_date FROM hospital_census
      ),
      recent_avg AS (
        SELECT ROUND(AVG(daily_total))::int AS avg_census
        FROM (
          SELECT census_date, SUM(current_census) AS daily_total
          FROM hospital_census
          WHERE census_date >= (SELECT max_date - INTERVAL '7 days' FROM latest)
          GROUP BY census_date
        ) d
      )
      SELECT
        SUM(hc.current_census)::int                                        AS "totalCensus",
        SUM(h.capacity)::int                                               AS "totalCapacity",
        ROUND(
          (SUM(hc.current_census)::numeric / NULLIF(SUM(h.capacity), 0)) * 100, 1
        )                                                                   AS "occupancyRate",
        (SELECT ROUND(avg_census * 1.015)::int FROM recent_avg)            AS "sevenDayForecast"
      FROM  hospital_census hc
      JOIN  hospitals h ON hc.hospital_id = h.id
      WHERE hc.census_date = (SELECT max_date FROM latest)
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
