import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/metricTypes — distinct metric values from facility_metrics (for alerts dropdown)
export async function metricTypesHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT DISTINCT metric FROM facility_metrics ORDER BY metric
    `);
    const metrics = rows.map((r) => r.metric);
    return {
      jsonBody: metrics,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('metricTypes query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('metricTypes', { methods: ['GET'], authLevel: 'anonymous', handler: metricTypesHandler });
