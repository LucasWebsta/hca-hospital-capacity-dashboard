import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/facilitiesList — id + name for dropdowns (all hospitals, no limit)
export async function facilitiesListHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT facility_id AS id, name FROM facilities ORDER BY name
    `);
    return {
      jsonBody: rows,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('facilitiesList query failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('facilitiesList', { methods: ['GET'], authLevel: 'anonymous', handler: facilitiesListHandler });
