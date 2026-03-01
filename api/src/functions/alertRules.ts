import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

const CORS = { 'Access-Control-Allow-Origin': '*' };

// GET /api/alertRules — list user-created alert rules
export async function alertRulesGetHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT ar.id, ar.facility_id AS hospital_id, f.name AS facility_name, ar.metric, ar.condition_type,
             ar.threshold_pct, ar.operator, ar.value_number, ar.window_minutes, ar.created_at
      FROM alert_rules ar
      JOIN facilities f ON f.facility_id = ar.facility_id
      ORDER BY ar.created_at DESC
    `);
    return { jsonBody: rows, headers: CORS };
  } catch (err) {
    context.error('alertRules GET failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' }, headers: CORS };
  }
}

// POST /api/alertRules — create a new alert rule
export async function alertRulesPostHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method?.toUpperCase() === 'OPTIONS') {
    return { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } };
  }
  try {
    const body = (await request.json()) as {
      hospital_id: number;  // frontend sends this; we store as facility_id
      metric: string;
      condition_type: string;
      threshold_pct?: number;
      operator?: string;
      value_number?: number;
      window_minutes?: number;
    };
    const { hospital_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes } = body;
    if (!hospital_id || !metric || !condition_type) {
      return { status: 400, jsonBody: { error: 'hospital_id, metric, condition_type required' }, headers: CORS };
    }
    const db = getDb();
    const { rows } = await db.query(
      `INSERT INTO alert_rules (facility_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, facility_id AS hospital_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes, created_at`,
      [hospital_id, metric, condition_type, threshold_pct ?? null, operator ?? null, value_number ?? null, window_minutes ?? null]
    );
    return { status: 201, jsonBody: rows[0], headers: CORS };
  } catch (err) {
    context.error('alertRules POST failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' }, headers: CORS };
  }
}

// DELETE /api/alertRules?id=123
export async function alertRulesDeleteHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const id = request.query.get('id');
    if (!id) return { status: 400, jsonBody: { error: 'id required' }, headers: CORS };
    const db = getDb();
    await db.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    return { status: 204, headers: CORS };
  } catch (err) {
    context.error('alertRules DELETE failed', err);
    return { status: 500, jsonBody: { error: 'Internal server error' }, headers: CORS };
  }
}

app.http('alertRules', { methods: ['GET'], authLevel: 'anonymous', handler: alertRulesGetHandler });
app.http('alertRulesPost', { methods: ['POST'], authLevel: 'anonymous', handler: alertRulesPostHandler });
app.http('alertRulesDelete', { methods: ['DELETE'], authLevel: 'anonymous', handler: alertRulesDeleteHandler });
