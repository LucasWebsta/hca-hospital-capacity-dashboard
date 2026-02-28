import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/trend?days=30
// Returns historical census + forecast for the occupancy trend chart
export async function trendHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const days = parseInt(request.query.get('days') ?? '30', 10);
    const pool = await getDb();

    // Historical actuals (network-wide sum per day)
    const actuals = await pool.request()
      .input('days', days)
      .query(`
        SELECT
          FORMAT(census_date, 'MMM d') AS date,
          SUM(current_census)          AS actual
        FROM dbo.HospitalCensus
        WHERE census_date >= DATEADD(DAY, -@days, CAST(GETDATE() AS DATE))
        GROUP BY census_date
        ORDER BY census_date ASC
      `);

    // Forecasts (network-wide, next 7 days)
    const forecasts = await pool.request().query(`
      SELECT
        FORMAT(forecast_date, 'MMM d') AS date,
        predicted_census               AS forecast,
        confidence_lower               AS lower,
        confidence_upper               AS upper
      FROM dbo.ForecastData
      WHERE hospital_id IS NULL
        AND forecast_date >= CAST(GETDATE() AS DATE)
      ORDER BY forecast_date ASC
    `);

    // Merge: last actual row gets a forecast value too (handoff point)
    const historicalRows = actuals.recordset;
    const forecastRows = forecasts.recordset;

    if (historicalRows.length > 0 && forecastRows.length > 0) {
      const lastActual = historicalRows[historicalRows.length - 1];
      lastActual.forecast = lastActual.actual;
    }

    const data = [...historicalRows, ...forecastRows];

    return {
      jsonBody: data,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('trend query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('trend', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: trendHandler,
});
