import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/facilities
// Returns top facilities ranked by occupancy rate
export async function facilitiesHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const pool = await getDb();
    const result = await pool.request().query(`
      SELECT TOP 5
        h.name,
        hc.current_census                                         AS census,
        CAST(hc.current_census AS FLOAT)
          / NULLIF(h.capacity, 0) * 100                          AS occupancy,
        h.capacity,
        -- compare to yesterday to get trend
        CASE
          WHEN hc.current_census > ISNULL(prev.current_census, hc.current_census)
            THEN 'up'
          WHEN hc.current_census < ISNULL(prev.current_census, hc.current_census)
            THEN 'down'
          ELSE 'flat'
        END AS trend
      FROM dbo.HospitalCensus hc
      INNER JOIN dbo.Hospitals h ON hc.hospital_id = h.id
      LEFT JOIN dbo.HospitalCensus prev
        ON prev.hospital_id = hc.hospital_id
        AND prev.census_date = DATEADD(DAY, -1, hc.census_date)
      WHERE hc.census_date = CAST(GETDATE() AS DATE)
      ORDER BY occupancy DESC
    `);

    return {
      jsonBody: result.recordset,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('facilities query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('facilities', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: facilitiesHandler,
});
