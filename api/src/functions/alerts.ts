import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/alerts
export async function alertsHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT
        a.id,
        h.name        AS hospital,
        a.severity,
        a.message,
        a.triggered_at,
        a.resolved_at,
        a.is_active
      FROM  alerts a
      JOIN  hospitals h ON a.hospital_id = h.id
      WHERE a.is_active = TRUE
      ORDER BY
        CASE a.severity
          WHEN 'HIGH'   THEN 1
          WHEN 'MEDIUM' THEN 2
          WHEN 'LOW'    THEN 3
          WHEN 'OK'     THEN 4
          ELSE 5
        END,
        a.triggered_at DESC
    `);
    return {
      jsonBody: rows,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('alerts query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('alerts', { methods: ['GET'], authLevel: 'anonymous', handler: alertsHandler });
