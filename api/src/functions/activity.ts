import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/activity
export async function getActivityLogsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const action = request.query.get('action') || 'all';
    const limit = parseInt(request.query.get('limit') || '50', 10);

    const db = getDb();
    let query = `
      SELECT id, user_id, user_name, action, timestamp
      FROM activity_logs
    `;
    const params: unknown[] = [];

    if (action !== 'all') {
      query += ' WHERE action = $1';
      params.push(action);
    }

    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const { rows } = await db.query(query, params);

    const logs = rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      action: row.action,
      timestamp: row.timestamp,
    }));

    return {
      status: 200,
      jsonBody: logs,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('Get activity logs error:', err);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  }
}

app.http('activity', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: getActivityLogsHandler,
});


