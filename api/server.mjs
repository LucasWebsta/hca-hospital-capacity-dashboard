/**
 * Local dev server — mimics Azure Functions endpoints at http://localhost:7071/api/*
 * Run with: node api/server.mjs
 *
 * Schema:
 *   facilities(id, name, capacity, region, facility_id)
 *   facility_metrics(id, facility_id, metric, source_update_date, metric_value)
 *     metrics: 'Total Census', 'Admissions', 'Discharges', 'Births', 'ICU Occupancy'
 *     facility_metrics.facility_id -> facilities.facility_id
 *   forecast_data(id, hospital_id, forecast_date, predicted_census, confidence_lower, confidence_upper)
 *   alerts(id, hospital_id, severity, message, is_active, triggered_at, resolved_at)
 */
import http from 'http';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb',
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const PORT = 7071;

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ── /api/census ──────────────────────────────────────────────────────────────
async function handleCensus(res) {
  const { rows } = await pool.query(`
    WITH latest_per_facility AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id,
        fm.metric_value AS total_census,
        f.capacity
      FROM facility_metrics fm
      JOIN facilities f ON f.facility_id = fm.facility_id
      WHERE fm.metric = 'Total Census'
      ORDER BY fm.facility_id, fm.source_update_date DESC
    ),
    totals AS (
      SELECT
        SUM(total_census)::int AS "totalCensus",
        SUM(capacity)::int     AS "totalCapacity"
      FROM latest_per_facility
    ),
    forecast_next AS (
      SELECT predicted_census AS "sevenDayForecast"
      FROM forecast_data
      WHERE hospital_id IS NULL
      ORDER BY forecast_date ASC
      LIMIT 1
    )
    SELECT
      t."totalCensus",
      t."totalCapacity",
      ROUND((t."totalCensus"::numeric / NULLIF(t."totalCapacity", 0)) * 100, 1) AS "occupancyRate",
      COALESCE(f."sevenDayForecast", ROUND(t."totalCensus" * 1.015)::int)        AS "sevenDayForecast"
    FROM totals t
    LEFT JOIN forecast_next f ON TRUE
  `);
  json(res, rows[0] ?? {});
}

// ── /api/facilities ───────────────────────────────────────────────────────────
async function handleFacilities(res) {
  const { rows } = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id, fm.metric_value AS census, fm.source_update_date AS latest_ts
      FROM facility_metrics fm
      WHERE fm.metric = 'Total Census'
      ORDER BY fm.facility_id, fm.source_update_date DESC
    ),
    day_ago AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id, fm.metric_value AS prev_census
      FROM facility_metrics fm
      JOIN latest l ON l.facility_id = fm.facility_id
      WHERE fm.metric = 'Total Census'
        AND fm.source_update_date <= l.latest_ts - INTERVAL '24 hours'
      ORDER BY fm.facility_id, fm.source_update_date DESC
    )
    SELECT
      f.name,
      l.census::int                                                        AS census,
      ROUND((l.census::numeric / NULLIF(f.capacity, 0)) * 100, 1)         AS occupancy,
      f.capacity,
      CASE
        WHEN l.census > COALESCE(d.prev_census, l.census) THEN 'up'
        WHEN l.census < COALESCE(d.prev_census, l.census) THEN 'down'
        ELSE 'flat'
      END AS trend
    FROM facilities f
    JOIN latest l ON l.facility_id = f.facility_id
    LEFT JOIN day_ago d ON d.facility_id = f.facility_id
    ORDER BY occupancy DESC
    LIMIT 5
  `);
  json(res, rows);
}

// ── /api/alerts ───────────────────────────────────────────────────────────────
async function handleAlerts(res) {
  const { rows } = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id, fm.metric_value AS census
      FROM facility_metrics fm
      WHERE fm.metric = 'Total Census'
      ORDER BY fm.facility_id, fm.source_update_date DESC
    ),
    occ AS (
      SELECT
        f.id, f.name,
        ROUND((l.census::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy_pct
      FROM facilities f
      JOIN latest l ON l.facility_id = f.facility_id
    )
    SELECT
      id,
      name AS hospital,
      CASE
        WHEN occupancy_pct >= 95 THEN 'HIGH'
        WHEN occupancy_pct >= 85 THEN 'MEDIUM'
        WHEN occupancy_pct >= 75 THEN 'LOW'
        ELSE 'OK'
      END AS severity,
      CASE
        WHEN occupancy_pct >= 95 THEN name || ' at critical capacity (' || occupancy_pct || '%)'
        WHEN occupancy_pct >= 85 THEN name || ' occupancy elevated (' || occupancy_pct || '%)'
        WHEN occupancy_pct >= 75 THEN name || ' approaching threshold (' || occupancy_pct || '%)'
        ELSE name || ' operating normally (' || occupancy_pct || '%)'
      END AS message,
      NOW() AS triggered_at, TRUE AS is_active
    FROM occ
    WHERE occupancy_pct >= 75
    ORDER BY occupancy_pct DESC
  `);
  json(res, rows);
}

// ── /api/trend ────────────────────────────────────────────────────────────────
async function handleTrend(res, days = 30) {
  // Daily Total Census summed across all facilities
  const { rows: actuals } = await pool.query(`
    SELECT
      TO_CHAR(DATE(source_update_date), 'Mon DD') AS date,
      ROUND(SUM(avg_by_fac))::int                 AS actual
    FROM (
      SELECT
        facility_id,
        DATE(source_update_date) AS d,
        AVG(metric_value)        AS avg_by_fac
      FROM facility_metrics
      WHERE metric = 'Total Census'
        AND source_update_date >= (
          SELECT MAX(source_update_date) FROM facility_metrics WHERE metric = 'Total Census'
        ) - ($1 || ' days')::INTERVAL
      GROUP BY facility_id, DATE(source_update_date)
    ) sub
    GROUP BY DATE(source_update_date)
    ORDER BY DATE(source_update_date) ASC
  `, [days]);

  // Real forecast data
  const { rows: forecasts } = await pool.query(`
    SELECT
      TO_CHAR(forecast_date, 'Mon DD') AS date,
      predicted_census                 AS forecast,
      confidence_lower                 AS lower,
      confidence_upper                 AS upper
    FROM forecast_data
    WHERE hospital_id IS NULL
      AND forecast_date >= CURRENT_DATE
    ORDER BY forecast_date ASC
  `);

  const result = [...actuals];
  if (result.length > 0 && forecasts.length > 0) {
    result[result.length - 1].forecast = result[result.length - 1].actual;
  }
  result.push(...forecasts);
  json(res, result);
}

// ── /api/forecast ─────────────────────────────────────────────────────────────
async function handleForecast(res, days = 7) {
  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(forecast_date, 'Mon DD') AS date,
      predicted_census                 AS predicted,
      confidence_lower                 AS lower,
      confidence_upper                 AS upper
    FROM forecast_data
    WHERE hospital_id IS NULL
      AND forecast_date >= CURRENT_DATE
      AND forecast_date < CURRENT_DATE + ($1 || ' days')::INTERVAL
    ORDER BY forecast_date ASC
  `, [days]);

  json(res, { data: rows, stats: { mae: 5.8, rmse: 8.2, accuracy: 92.1, upliftPct: 2.6 } });
}

// ── /api/users ────────────────────────────────────────────────────────────────
async function handleUsersGet(res) {
  try {
    // Query without status column first (in case it doesn't exist)
    // Exclude admin user (Kevin) from the list
    const { rows } = await pool.query(`
      SELECT id, first_name, last_name, email, role, created_at
      FROM users
      WHERE LOWER(first_name) != 'kevin'
      ORDER BY created_at DESC
    `);
    
    const users = rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      role: row.role,
      status: 'Active', // Default status
      createdAt: row.created_at,
    }));
    
    json(res, users);
  } catch (err) {
    // If users table doesn't exist, return empty array
    if (err.message.includes('does not exist')) {
      console.warn('Users table does not exist. Please run users_schema.sql in your database.');
      json(res, []);
    } else {
      console.error('Get users error:', err);
      json(res, { error: 'Internal server error' }, 500);
    }
  }
}

async function handleUsersPost(res, body) {
  const { firstName, lastName, email, role, password } = body;
  
  if (!firstName || !lastName || !email || !role || !password) {
    json(res, { error: 'All fields are required' }, 400);
    return;
  }
  
  try {
    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      json(res, { error: 'User with this email already exists' }, 409);
      return;
    }
    
    // Try to insert with status column, fallback without it
    let rows;
    try {
      const result = await pool.query(`
        INSERT INTO users (first_name, last_name, email, password_hash, role, status)
        VALUES ($1, $2, $3, $4, $5, 'Active')
        RETURNING id, first_name, last_name, email, role
      `, [firstName, lastName, email.toLowerCase(), password, role]);
      rows = result.rows;
    } catch (err) {
      if (err.message.includes('column') && err.message.includes('status')) {
        // Status column doesn't exist, insert without it
        const result = await pool.query(`
          INSERT INTO users (first_name, last_name, email, password_hash, role)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, first_name, last_name, email, role
        `, [firstName, lastName, email.toLowerCase(), password, role]);
        rows = result.rows;
      } else {
        throw err;
      }
    }
    
    const newUser = rows[0];
    
    // Log user creation (if activity_logs table exists)
    try {
      await pool.query(`
        INSERT INTO activity_logs (user_id, user_name, action)
        VALUES ($1, $2, 'user_added')
      `, [newUser.id, `${firstName} ${lastName}`]);
    } catch (err) {
      // Activity logs table might not exist, that's okay
      console.warn('Could not log user creation:', err.message);
    }
    
    json(res, {
      id: newUser.id,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      email: newUser.email,
      role: newUser.role,
      status: 'Active',
    }, 201);
  } catch (err) {
    console.error('Add user error:', err);
    json(res, { error: 'Internal server error' }, 500);
  }
}

async function handleUsersDelete(res, userId) {
  if (!userId) {
    json(res, { error: 'User ID is required' }, 400);
    return;
  }
  
  try {
    // Get user info before deleting
    const { rows } = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    
    if (rows.length === 0) {
      json(res, { error: 'User not found' }, 404);
      return;
    }
    
    const userName = `${rows[0].first_name} ${rows[0].last_name}`;
    
    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    // Log user deletion
    await pool.query(`
      INSERT INTO activity_logs (user_name, action)
      VALUES ($1, 'user_removed')
    `, [userName]);
    
    json(res, { message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    json(res, { error: 'Internal server error' }, 500);
  }
}

// ── /api/activity ─────────────────────────────────────────────────────────────
async function handleActivity(res, action = 'all', limit = 50) {
  try {
    let query = `
      SELECT id, user_id, user_name, action, timestamp
      FROM activity_logs
    `;
    const params = [];
    
    if (action !== 'all') {
      query += ' WHERE action = $1';
      params.push(action);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const { rows } = await pool.query(query, params);
    
    const logs = rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      action: row.action,
      timestamp: row.timestamp,
    }));
    
    json(res, logs);
  } catch (err) {
    // If activity_logs table doesn't exist, return empty array
    if (err.message.includes('does not exist')) {
      console.warn('Activity logs table does not exist. Please run users_schema.sql in your database.');
      json(res, []);
    } else {
      console.error('Get activity logs error:', err);
      json(res, { error: 'Internal server error' }, 500);
    }
  }
}

// ── /api/auth/login ────────────────────────────────────────────────────────────
async function handleLogin(res, body) {
  const { email, password } = body;
  
  if (!email || !password) {
    json(res, { error: 'Email and password are required' }, 400);
    return;
  }
  
  try {
    // Query user - check for status column if it exists
    let query = `
      SELECT id, first_name, last_name, email, role, password_hash
      FROM users
      WHERE email = $1
    `;
    
    const { rows } = await pool.query(query, [email.toLowerCase()]);
    
    if (rows.length === 0) {
      // Log failed login attempt
      try {
        await pool.query(`
          INSERT INTO activity_logs (user_name, action)
          VALUES ($1, 'signin')
        `, [email]);
      } catch (err) {
        // Activity logs table might not exist
      }
      
      json(res, { error: 'Invalid email or password' }, 401);
      return;
    }
    
    const user = rows[0];
    
    // Check password (simple comparison for demo)
    if (user.password_hash !== password) {
      // Log failed login attempt
      try {
        await pool.query(`
          INSERT INTO activity_logs (user_name, action)
          VALUES ($1, 'signin')
        `, [email]);
      } catch (err) {
        // Activity logs table might not exist
      }
      
      json(res, { error: 'Invalid email or password' }, 401);
      return;
    }
    
    // Check if user is Kevin - only Kevin can access admin page
    const firstName = user.first_name.toLowerCase();
    const isKevin = firstName === 'kevin';
    
    // Log successful login
    try {
      await pool.query(`
        INSERT INTO activity_logs (user_id, user_name, action)
        VALUES ($1, $2, 'signin')
      `, [user.id, `${user.first_name} ${user.last_name}`]);
    } catch (err) {
      // Activity logs table might not exist
    }
    
    // Return user data with admin access flag
    json(res, {
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
      },
      canAccessAdmin: isKevin, // Only Kevin can access admin
    });
  } catch (err) {
    console.error('Login error:', err);
    json(res, { error: 'Internal server error' }, 500);
  }
}

// ── /api/auth/logout ────────────────────────────────────────────────────────────
async function handleLogout(res, body) {
  try {
    const { userId, userName } = body || {};
    
    // Log logout if user info provided
    if (userId || userName) {
      try {
        await pool.query(`
          INSERT INTO activity_logs (user_id, user_name, action)
          VALUES ($1, $2, 'signout')
        `, [userId || null, userName || 'Unknown']);
      } catch (err) {
        // Activity logs table might not exist
        console.warn('Could not log logout:', err.message);
      }
    }
    
    json(res, { message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    json(res, { error: 'Internal server error' }, 500);
  }
}

// ── Helper: Read request body ─────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);
  const action = url.searchParams.get('action') || 'all';
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${url.pathname}`);

  try {
    // Handle root /api endpoint
    if (path === '/' || path === '') {
      if (req.method === 'GET') {
        json(res, {
          message: 'HCA Census API',
          version: '1.0.0',
          endpoints: {
            GET: ['/census', '/facilities', '/alerts', '/trend', '/forecast', '/users', '/activity'],
            POST: ['/users', '/auth/login', '/auth/logout'],
            DELETE: ['/users/:id']
          }
        });
        return;
      }
    }
    
    // GET endpoints
    if (req.method === 'GET') {
      if (path === '/census')     return await handleCensus(res);
      if (path === '/facilities') return await handleFacilities(res);
      if (path === '/alerts')     return await handleAlerts(res);
      if (path === '/trend')      return await handleTrend(res, days);
      if (path === '/forecast')   return await handleForecast(res, days);
      if (path === '/users')      return await handleUsersGet(res);
      if (path === '/activity')   return await handleActivity(res, action, limit);
    }
    
    // POST endpoints
    if (req.method === 'POST') {
      if (path === '/users') {
        const body = await readBody(req);
        return await handleUsersPost(res, body);
      }
      if (path === '/auth/login') {
        const body = await readBody(req);
        return await handleLogin(res, body);
      }
      if (path === '/auth/logout') {
        const body = await readBody(req);
        return await handleLogout(res, body);
      }
    }
    
    // DELETE endpoints
    if (req.method === 'DELETE') {
      if (path.startsWith('/users/')) {
        const userId = path.split('/')[2];
        return await handleUsersDelete(res, userId);
      }
    }
    
    json(res, { 
      error: 'Not found', 
      path: url.pathname,
      method: req.method,
      availableEndpoints: {
        GET: ['/api/census', '/api/facilities', '/api/alerts', '/api/trend', '/api/forecast', '/api/users', '/api/activity'],
        POST: ['/api/users', '/api/auth/login', '/api/auth/logout'],
        DELETE: ['/api/users/:id']
      }
    }, 404);
  } catch (err) {
    console.error(`  ERROR [${path}]:`, err.message);
    json(res, { error: err.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n✅  API server running at http://localhost:${PORT}/api`);
  console.log('   GET  /census  /facilities  /alerts  /trend?days=N  /forecast?days=N');
  console.log('   GET  /users  /activity?action=signin&limit=50');
  console.log('   POST /users  /auth/login  /auth/logout');
  console.log('   DELETE /users/:id\n');
});
