import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/alerts
// Returns active alerts sorted by severity
export async function alertsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const pool = await getDb();
    const result = await pool.request().query(`
      SELECT
        a.id,
        h.name        AS hospital,
        a.severity,
        a.message,
        a.triggered_at,
        a.resolved_at,
        a.is_active
      FROM dbo.Alerts a
      INNER JOIN dbo.Hospitals h ON a.hospital_id = h.id
      WHERE a.is_active = 1
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
      jsonBody: result.recordset,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('alerts query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('alerts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: alertsHandler,
});
