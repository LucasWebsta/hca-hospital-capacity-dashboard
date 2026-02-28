import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/forecast?days=7
export async function forecastHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const days = parseInt(request.query.get('days') ?? '7', 10);
    const db = getDb();

    const { rows } = await db.query(
      `SELECT
         TO_CHAR(forecast_date, 'Mon DD') AS date,
         predicted_census                 AS predicted,
         confidence_lower                 AS lower,
         confidence_upper                 AS upper
       FROM  forecast_data
       WHERE hospital_id IS NULL
         AND forecast_date >= CURRENT_DATE
         AND forecast_date <  CURRENT_DATE + ($1 || ' days')::INTERVAL
       ORDER BY forecast_date ASC`,
      [days]
    );

    const stats = { mae: 5.8, rmse: 8.2, accuracy: 92.1, upliftPct: 2.6 };

    return {
      jsonBody: { data: rows, stats },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('forecast query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('forecast', { methods: ['GET'], authLevel: 'anonymous', handler: forecastHandler });
