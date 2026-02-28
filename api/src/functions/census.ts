import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/census
export async function censusHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT
        SUM(hc.current_census)::int                                       AS "totalCensus",
        SUM(h.capacity)::int                                              AS "totalCapacity",
        ROUND(
          (SUM(hc.current_census)::numeric / NULLIF(SUM(h.capacity),0)) * 100, 1
        )                                                                  AS "occupancyRate",
        (
          SELECT predicted_census
          FROM   forecast_data
          WHERE  hospital_id IS NULL
          ORDER  BY forecast_date ASC
          LIMIT  1
        )                                                                  AS "sevenDayForecast"
      FROM  hospital_census hc
      JOIN  hospitals h ON hc.hospital_id = h.id
      WHERE hc.census_date = CURRENT_DATE
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
