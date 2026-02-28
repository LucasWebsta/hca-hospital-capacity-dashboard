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
      SELECT
        h.name,
        hc.current_census                                              AS census,
        ROUND(
          (hc.current_census::numeric / NULLIF(h.capacity, 0)) * 100, 1
        )                                                              AS occupancy,
        h.capacity,
        CASE
          WHEN hc.current_census > COALESCE(prev.current_census, hc.current_census) THEN 'up'
          WHEN hc.current_census < COALESCE(prev.current_census, hc.current_census) THEN 'down'
          ELSE 'flat'
        END AS trend
      FROM  hospital_census hc
      JOIN  hospitals h  ON hc.hospital_id = h.id
      LEFT JOIN hospital_census prev
        ON  prev.hospital_id = hc.hospital_id
        AND prev.census_date  = hc.census_date - INTERVAL '1 day'
      WHERE hc.census_date = CURRENT_DATE
      ORDER BY occupancy DESC
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
