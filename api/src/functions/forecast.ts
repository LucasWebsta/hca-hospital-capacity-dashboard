import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/forecast?days=7
// Returns forecast data for the ForecastOccupancyChart card
export async function forecastHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const days = parseInt(request.query.get('days') ?? '7', 10);
    const pool = await getDb();

    const result = await pool.request()
      .input('days', days)
      .query(`
        SELECT
          FORMAT(forecast_date, 'MMM d') AS date,
          predicted_census               AS predicted,
          confidence_lower               AS lower,
          confidence_upper               AS upper
        FROM dbo.ForecastData
        WHERE hospital_id IS NULL
          AND forecast_date >= CAST(GETDATE() AS DATE)
          AND forecast_date < DATEADD(DAY, @days, CAST(GETDATE() AS DATE))
        ORDER BY forecast_date ASC
      `);

    // Simple model accuracy stats (would come from your ML pipeline in production)
    const stats = {
      mae: 5.8,
      rmse: 8.2,
      accuracy: 92.1,
      upliftPct: 2.6,
    };

    return {
      jsonBody: { data: result.recordset, stats },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('forecast query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('forecast', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: forecastHandler,
});
