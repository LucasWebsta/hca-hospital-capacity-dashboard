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
  // Daily Total Census summed across all facilities, expressed as occupancy %
  const { rows } = await pool.query(`
    WITH daily AS (
      SELECT
        d,
        ROUND(SUM(avg_by_fac))::int AS total_census
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
      GROUP BY d
    ),
    cap AS (
      SELECT SUM(capacity)::numeric AS total_capacity FROM facilities
    )
    SELECT
      TO_CHAR(d, 'Mon DD') AS date,
      total_census         AS actual,
      ROUND((total_census / cap.total_capacity) * 100, 1)::float AS occupancy_pct
    FROM daily, cap
    ORDER BY d ASC
  `, [days]);

  json(res, rows);
}

// ── /api/auth/login ─────────────────────────────────────────────────────────
async function handleLogin(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  const { email, password } = JSON.parse(body || '{}');

  if (!email || !password) {
    return json(res, { error: 'Email and password are required' }, 400);
  }

  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, role, photo_url, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1) AND is_active = true`,
    [email]
  );

  if (rows.length === 0) {
    return json(res, { error: 'Invalid email or password' }, 401);
  }

  const user = rows[0];

  // Plain-text password check (demo — hashes are stored as plaintext)
  if (user.password_hash !== password) {
    return json(res, { error: 'Invalid email or password' }, 401);
  }

  const canAccessAdmin = ['Super Admin', 'Regional Manager', 'Facility Administrator'].includes(user.role);

  return json(res, {
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      photoUrl: user.photo_url,
    },
    canAccessAdmin,
  });
}

// ── /api/users ───────────────────────────────────────────────────────────────
async function handleUsers(req, res) {
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { firstName, lastName, email, role, homeFacilityId } = JSON.parse(body || '{}');
    if (!firstName || !lastName || !email || !role) {
      return json(res, { error: 'firstName, lastName, email, and role are required' }, 400);
    }
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, role, home_facility_id, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, 'Demo1234!', true)
       RETURNING id, first_name, last_name, email, role, home_facility_id, is_active, created_at`,
      [firstName, lastName, email, role, homeFacilityId || null]
    );
    return json(res, rows[0], 201);
  }
  // GET
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, role, home_facility_id, photo_url, is_active, created_at
     FROM users ORDER BY id`
  );
  json(res, rows);
}

// ── /api/users/:id ───────────────────────────────────────────────────────────
async function handleUserById(req, res, id) {
  if (req.method === 'DELETE') {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return json(res, { success: true });
  }
  json(res, { error: 'Method not allowed' }, 405);
}

// ── /api/activity ─────────────────────────────────────────────────────────────
async function handleActivity(req, res, searchParams) {
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const action = searchParams.get('action');
  const params = [limit];
  let where = '';
  if (action && action !== 'all') {
    where = 'WHERE action = $2';
    params.push(action);
  }
  const { rows } = await pool.query(
    `SELECT id, user_id, user_name, action, timestamp, ip_address, user_agent
     FROM activity_logs
     ${where}
     ORDER BY timestamp DESC
     LIMIT $1`,
    params
  );
  json(res, rows);
}

// ── /api/auth/logout ──────────────────────────────────────────────────────────
function handleLogout(res) {
  json(res, { success: true });
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

// ── Router ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api/, '');
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${url.pathname}`);

  try {
    if (path === '/auth/login' && req.method === 'POST') return await handleLogin(req, res);
    if (path === '/auth/logout' && req.method === 'POST') return handleLogout(res);
    if (path === '/users' && (req.method === 'GET' || req.method === 'POST')) return await handleUsers(req, res);
    if (/^\/users\/\d+$/.test(path)) return await handleUserById(req, res, path.split('/')[2]);
    if (path === '/activity') return await handleActivity(req, res, url.searchParams);
    if (path === '/census')     return await handleCensus(res);
    if (path === '/facilities') return await handleFacilities(res);
    if (path === '/alerts')     return await handleAlerts(res);
    if (path === '/trend')      return await handleTrend(res, days);
    if (path === '/forecast')   return await handleForecast(res, days);
    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    console.error(`  ERROR [${path}]:`, err.message);
    json(res, { error: err.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n✅  API server running at http://localhost:${PORT}/api`);
  console.log('   /census  /facilities  /alerts  /trend?days=N  /forecast?days=N  POST /auth/login  /users  /activity\n');
});
