import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/trend?days=30
export async function trendHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const days = parseInt(request.query.get('days') ?? '30', 10);
    const db = getDb();

    const actuals = await db.query(
      `SELECT
         TO_CHAR(census_date, 'Mon DD') AS date,
         SUM(current_census)::int       AS actual
       FROM  hospital_census
       WHERE census_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
       GROUP BY census_date
       ORDER BY census_date ASC`,
      [days]
    );

    const forecasts = await db.query(`
      SELECT
        TO_CHAR(forecast_date, 'Mon DD') AS date,
        predicted_census                 AS forecast,
        confidence_lower                 AS lower,
        confidence_upper                 AS upper
      FROM  forecast_data
      WHERE hospital_id IS NULL
        AND forecast_date >= CURRENT_DATE
      ORDER BY forecast_date ASC
    `);

    const historicalRows = actuals.rows as Record<string, unknown>[];
    const forecastRows = forecasts.rows;

    if (historicalRows.length > 0 && forecastRows.length > 0) {
      historicalRows[historicalRows.length - 1].forecast = historicalRows[historicalRows.length - 1].actual;
    }

    return {
      jsonBody: [...historicalRows, ...forecastRows],
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('trend query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('trend', { methods: ['GET'], authLevel: 'anonymous', handler: trendHandler });
