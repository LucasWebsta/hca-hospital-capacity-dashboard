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

    // Pull actuals from the most recent N days of available data
    const actuals = await db.query(
      `SELECT
         TO_CHAR(census_date, 'Mon DD') AS date,
         SUM(current_census)::int       AS actual
       FROM  hospital_census
       WHERE census_date >= (SELECT MAX(census_date) FROM hospital_census) - ($1 || ' days')::INTERVAL
       GROUP BY census_date
       ORDER BY census_date ASC`,
      [days]
    );

    const historicalRows = actuals.rows as Record<string, unknown>[];

    // Generate a 7-day forward forecast by extrapolating from the last known value
    if (historicalRows.length >= 2) {
      const last = historicalRows[historicalRows.length - 1];
      const prev = historicalRows[historicalRows.length - 2];
      const lastVal = last.actual as number;
      const prevVal = prev.actual as number;
      const dailyDelta = Math.round((lastVal - prevVal) * 0.5); // dampened trend
      // Stitch forecast onto last actual
      last.forecast = lastVal;
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const label = `${months[d.getMonth()]} ${String(d.getDate()).padStart(2,'0')}`;
        historicalRows.push({
          date: label,
          forecast: lastVal + dailyDelta * i,
          lower: Math.round((lastVal + dailyDelta * i) * 0.97),
          upper: Math.round((lastVal + dailyDelta * i) * 1.03),
        });
      }
    }

    return {
      jsonBody: historicalRows,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('trend query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('trend', { methods: ['GET'], authLevel: 'anonymous', handler: trendHandler });
