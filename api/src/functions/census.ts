import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/census
// Returns network-wide totals for the metric cards
export async function censusHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const pool = await getDb();
    const result = await pool.request().query(`
      SELECT
        SUM(hc.current_census)                                    AS totalCensus,
        SUM(h.capacity)                                           AS totalCapacity,
        CAST(SUM(hc.current_census) AS FLOAT)
          / NULLIF(SUM(h.capacity), 0) * 100                     AS occupancyRate,
        (SELECT TOP 1 predicted_census
           FROM dbo.ForecastData
           WHERE hospital_id IS NULL
           ORDER BY forecast_date ASC)                            AS sevenDayForecast
      FROM dbo.HospitalCensus hc
      INNER JOIN dbo.Hospitals h ON hc.hospital_id = h.id
      WHERE hc.census_date = CAST(GETDATE() AS DATE)
    `);

    return {
      jsonBody: result.recordset[0],
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('census query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('census', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: censusHandler,
});
