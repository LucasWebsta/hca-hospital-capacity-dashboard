import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getDb } from '../db';

// GET /api/users
export async function getUsersHandler(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT id, first_name, last_name, email, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    const users = rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      role: row.role,
      status: (row as { status?: string }).status || 'Active',
      createdAt: row.created_at,
    }));

    return {
      status: 200,
      jsonBody: users,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('Get users error:', err);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  }
}

// POST /api/users
export async function addUserHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as {
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      password: string;
    };

    const { firstName, lastName, email, role, password } = body;

    if (!firstName || !lastName || !email || !role || !password) {
      return {
        status: 400,
        jsonBody: { error: 'All fields are required' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    const db = getDb();

    // Check if email already exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return {
        status: 409,
        jsonBody: { error: 'User with this email already exists' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    // Insert new user (omit status if column does not exist)
    const { rows } = await db.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, first_name, last_name, email, role, created_at`,
      [firstName, lastName, email.toLowerCase(), password, role]
    );

    const newUser = rows[0];

    // Log user creation
    await db.query(
      `INSERT INTO activity_logs (user_id, user_name, action)
       VALUES ($1, $2, 'user_added')`,
      [newUser.id, `${firstName} ${lastName}`]
    );

    return {
      status: 201,
      jsonBody: {
        id: newUser.id,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        email: newUser.email,
        role: newUser.role,
        status: 'Active',
      },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('Add user error:', err);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  }
}

// PATCH /api/users/me — update current user's default trend days (date filter)
export async function updateMyPreferencesHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } };
  }
  try {
    const body = await request.json() as { userId?: number; defaultTrendDays?: number };
    const { userId, defaultTrendDays } = body;

    if (userId == null) {
      return {
        status: 400,
        jsonBody: { error: 'userId is required' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    const allowed = [7, 14, 30, 60];
    if (typeof defaultTrendDays !== 'number' || !allowed.includes(defaultTrendDays)) {
      return {
        status: 400,
        jsonBody: { error: 'defaultTrendDays must be 7, 14, 30, or 60' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    const db = getDb();
    const { rowCount } = await db.query(
      'UPDATE users SET default_trend_days = $1, updated_at = NOW() WHERE id = $2',
      [defaultTrendDays, userId]
    );

    if (rowCount === 0) {
      return {
        status: 404,
        jsonBody: { error: 'User not found' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    return {
      status: 200,
      jsonBody: { defaultTrendDays },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('PATCH users/me error:', err);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  }
}

// DELETE /api/users/:id
export async function deleteUserHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const userId = request.params.id || request.query.get('id');
    
    if (!userId) {
      return {
        status: 400,
        jsonBody: { error: 'User ID is required' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    const db = getDb();

    // Get user info before deleting
    const { rows } = await db.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return {
        status: 404,
        jsonBody: { error: 'User not found' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    const userName = `${rows[0].first_name} ${rows[0].last_name}`;

    // Delete user
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    // Log user deletion
    await db.query(
      `INSERT INTO activity_logs (user_name, action)
       VALUES ($1, 'user_removed')`,
      [userName]
    );

    return {
      status: 200,
      jsonBody: { message: 'User deleted successfully' },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('Delete user error:', err);
    return {
      status: 500,
      jsonBody: { error: 'Internal server error' },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  }
}

app.http('users', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  handler: async (req, ctx) => {
    if (req.method === 'GET') return getUsersHandler(req, ctx);
    if (req.method === 'POST') return addUserHandler(req, ctx);
    return { status: 405, jsonBody: { error: 'Method not allowed' } };
  },
});

app.http('users-me', {
  methods: ['PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'users/me',
  handler: updateMyPreferencesHandler,
});

app.http('users-delete', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'users/{id?}',
  handler: deleteUserHandler,
});