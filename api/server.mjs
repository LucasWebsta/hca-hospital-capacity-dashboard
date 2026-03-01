/**
 * Local dev server — mimics Azure Functions endpoints at http://localhost:7071/api/*
 * Run with: node api/server.mjs
 *
 * Schema:
 *   facilities(id, name, capacity, region, facility_id)
 *   facility_metrics_wide(facility_id, update_utc, admissions, discharges, births, icu_occupancy, total_census, metrics, created_at)
 *     PK: (facility_id, update_utc)
 *     facility_metrics_wide.facility_id -> facilities.facility_id
 *   forecast_data(id, hospital_id, forecast_date, predicted_census, confidence_lower, confidence_upper)
 *   alerts(id, hospital_id, severity, message, is_active, triggered_at, resolved_at)
 */
import http from 'http';
import pg from 'pg';
import bcrypt from 'bcryptjs';

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// helper: map metric display name to facility_metrics_wide column
function metricToColumn(metric) {
  const m = (metric || '').toLowerCase();
  if (m.includes('admiss'))  return 'admissions';
  if (m.includes('discharg')) return 'discharges';
  if (m.includes('birth'))   return 'births';
  if (m.includes('icu'))     return 'icu_occupancy';
  return 'total_census';
}

// ── /api/census ──────────────────────────────────────────────────────────────
async function handleCensus(res, facilityId = null) {
  if (facilityId) {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (fw.facility_id)
        fw.total_census::int AS "totalCensus",
        f.capacity::int      AS "totalCapacity",
        ROUND((fw.total_census::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS "occupancyRate",
        ROUND(fw.total_census * 1.015)::int AS "sevenDayForecast"
      FROM facility_metrics_wide fw
      JOIN facilities f ON f.facility_id = fw.facility_id
      WHERE fw.facility_id = $1
      ORDER BY fw.facility_id, fw.update_utc DESC
    `, [facilityId]);
    return json(res, rows[0] ?? {});
  }
  const { rows } = await pool.query(`
    WITH latest_per_facility AS (
      SELECT DISTINCT ON (fw.facility_id)
        fw.facility_id,
        fw.total_census,
        f.capacity
      FROM facility_metrics_wide fw
      JOIN facilities f ON f.facility_id = fw.facility_id
      ORDER BY fw.facility_id, fw.update_utc DESC
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

// ── /api/facilitiesList ───────────────────────────────────────────────────────
async function handleFacilitiesList(res) {
  const { rows } = await pool.query(`SELECT facility_id AS id, name FROM facilities ORDER BY name`);
  json(res, rows);
}

// ── /api/facilities ───────────────────────────────────────────────────────────
async function handleFacilities(res, facilityId = null) {
  const { rows } = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fw.facility_id)
        fw.facility_id, fw.total_census AS census, fw.update_utc AS latest_ts
      FROM facility_metrics_wide fw
      ORDER BY fw.facility_id, fw.update_utc DESC
    ),
    day_ago AS (
      SELECT DISTINCT ON (fw.facility_id)
        fw.facility_id, fw.total_census AS prev_census
      FROM facility_metrics_wide fw
      JOIN latest l ON l.facility_id = fw.facility_id
      WHERE fw.update_utc <= l.latest_ts - INTERVAL '24 hours'
      ORDER BY fw.facility_id, fw.update_utc DESC
    )
    SELECT
      f.facility_id,
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
    WHERE ($1::int IS NULL OR f.facility_id = $1)
    ORDER BY occupancy DESC
  `, [facilityId]);
  json(res, rows);
}

// ── /api/alerts ───────────────────────────────────────────────────────────────
async function handleAlerts(res, userId = null) {
  // 1. System-level threshold alerts
  const { rows: systemRows } = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fw.facility_id)
        fw.facility_id, fw.total_census AS census
      FROM facility_metrics_wide fw
      ORDER BY fw.facility_id, fw.update_utc DESC
    ),
    occ AS (
      SELECT
        f.facility_id AS id, f.name,
        ROUND((l.census::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy_pct,
        f.capacity
      FROM facilities f
      JOIN latest l ON l.facility_id = f.facility_id
    )
    SELECT
      id,
      id AS hospital_id,
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
      NOW() AS triggered_at, TRUE AS is_active, 'system' AS source
    FROM occ
    WHERE occupancy_pct >= 75
    ORDER BY occupancy_pct DESC
  `);

  // 2. User rule alerts
  const userRows = [];
  if (userId) {
    const { rows: rules } = await pool.query(
      `SELECT ar.id, ar.facility_id, f.name AS facility_name, ar.metric,
              ar.condition_type, ar.threshold_pct, ar.operator,
              ar.value_number, ar.window_minutes, f.capacity
       FROM alert_rules ar
       JOIN facilities f ON f.facility_id = ar.facility_id
       WHERE ar.user_id = $1`,
      [userId]
    );
    for (const rule of rules) {
      try {
        if (rule.condition_type === 'percent_occupancy' && rule.threshold_pct != null) {
          const { rows: mv } = await pool.query(
            `SELECT total_census AS metric_value FROM facility_metrics_wide
             WHERE facility_id = $1
             ORDER BY update_utc DESC LIMIT 1`, [rule.facility_id]
          );
          if (mv.length > 0) {
            const pct = rule.capacity > 0 ? (mv[0].metric_value / rule.capacity) * 100 : 0;
            if (pct >= Number(rule.threshold_pct)) {
              userRows.push({ id: rule.id * -1, hospital_id: rule.facility_id, hospital: rule.facility_name,
                severity: pct >= 95 ? 'HIGH' : pct >= 85 ? 'MEDIUM' : 'LOW',
                message: `[Your rule] ${rule.facility_name} ${rule.metric} occupancy at ${pct.toFixed(1)}% (threshold: ${rule.threshold_pct}%)`,
                triggered_at: new Date().toISOString(), is_active: true, source: 'user_rule' });
            }
          }
        } else if (rule.condition_type === 'value_threshold' && rule.operator && rule.value_number != null) {
          const col = metricToColumn(rule.metric);
          const { rows: mv } = await pool.query(
            `SELECT ${col} AS metric_value FROM facility_metrics_wide
             WHERE facility_id = $1
             ORDER BY update_utc DESC LIMIT 1`, [rule.facility_id]
          );
          if (mv.length > 0) {
            const val = Number(mv[0].metric_value);
            const thr = Number(rule.value_number);
            const triggered = (rule.operator === '>' && val > thr) || (rule.operator === '>=' && val >= thr) ||
                              (rule.operator === '<' && val < thr) || (rule.operator === '<=' && val <= thr);
            if (triggered) {
              userRows.push({ id: rule.id * -1, hospital_id: rule.facility_id, hospital: rule.facility_name,
                severity: 'MEDIUM',
                message: `[Your rule] ${rule.facility_name} ${rule.metric} is ${val} (${rule.operator} ${thr})`,
                triggered_at: new Date().toISOString(), is_active: true, source: 'user_rule' });
            }
          }
        } else if (rule.condition_type === 'surge_trend') {
          const col = metricToColumn(rule.metric);
          const { rows: mv } = await pool.query(
            `SELECT ${col} AS metric_value FROM facility_metrics_wide
             WHERE facility_id = $1
             ORDER BY update_utc DESC LIMIT 2`, [rule.facility_id]
          );
          if (mv.length >= 2) {
            const latest = Number(mv[0].metric_value);
            const prev   = Number(mv[1].metric_value);
            const changePct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
            if (changePct >= 5) {
              userRows.push({ id: rule.id * -1, hospital_id: rule.facility_id, hospital: rule.facility_name,
                severity: changePct >= 15 ? 'HIGH' : 'MEDIUM',
                message: `[Your rule] ${rule.facility_name} ${rule.metric} surged ${changePct.toFixed(1)}% recently`,
                triggered_at: new Date().toISOString(), is_active: true, source: 'user_rule' });
            }
          }
        }
      } catch (e) { console.warn('  rule eval error:', e.message); }
    }
  }
  json(res, [...systemRows, ...userRows]);
}

// ── /api/alertRules ───────────────────────────────────────────────────────────
async function handleAlertRulesGet(res, userId) {
  if (!userId) return json(res, []);
  const { rows } = await pool.query(
    `SELECT ar.id, ar.facility_id AS hospital_id, f.name AS facility_name, ar.metric,
            ar.condition_type, ar.threshold_pct, ar.operator, ar.value_number,
            ar.window_minutes, ar.created_at
     FROM alert_rules ar
     JOIN facilities f ON f.facility_id = ar.facility_id
     WHERE ar.user_id = $1
     ORDER BY ar.created_at DESC`,
    [userId]
  );
  json(res, rows);
}

async function handleAlertRulesPost(req, res, userId) {
  if (!userId) return json(res, { error: 'Login required to create alert rules' }, 401);
  const body = await readBody(req);
  const { hospital_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes } = body;
  if (!hospital_id || !metric || !condition_type)
    return json(res, { error: 'hospital_id, metric, condition_type required' }, 400);
  const { rows } = await pool.query(
    `INSERT INTO alert_rules (user_id, facility_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, facility_id AS hospital_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes, created_at`,
    [userId, hospital_id, metric, condition_type, threshold_pct ?? null, operator ?? null, value_number ?? null, window_minutes ?? null]
  );
  json(res, rows[0], 201);
}

async function handleAlertRulesDelete(req, res, id, userId) {
  if (!id)     return json(res, { error: 'id required' }, 400);
  if (!userId) return json(res, { error: 'Login required to delete alert rules' }, 401);
  const result = await pool.query('DELETE FROM alert_rules WHERE id = $1 AND user_id = $2', [id, userId]);
  if ((result.rowCount ?? 0) === 0) return json(res, { error: 'Alert rule not found or not owned by you' }, 404);
  res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
  res.end();
}

// ── /api/trend ────────────────────────────────────────────────────────────────
async function handleTrend(res, days = 30, facilityId = null) {
  if (facilityId) {
    const { rows } = await pool.query(`
      WITH daily AS (
        SELECT
          DATE(fw.update_utc)       AS d,
          AVG(fw.total_census)::int AS total_census,
          MAX(f.capacity)           AS capacity
        FROM facility_metrics_wide fw
        JOIN facilities f ON f.facility_id = fw.facility_id
        WHERE fw.facility_id = $2
          AND fw.update_utc >= (
            SELECT MAX(update_utc) FROM facility_metrics_wide
          ) - ($1 || ' days')::INTERVAL
        GROUP BY DATE(fw.update_utc)
      )
      SELECT
        TO_CHAR(d, 'Mon DD') AS date,
        total_census         AS actual,
        ROUND((total_census::numeric / NULLIF(capacity, 0)) * 100, 1)::float AS occupancy_pct
      FROM daily
      ORDER BY d ASC
    `, [days, facilityId]);
    return json(res, rows);
  }
  // All facilities
  const { rows } = await pool.query(`
    WITH daily AS (
      SELECT
        d,
        ROUND(SUM(avg_by_fac))::int AS total_census
      FROM (
        SELECT
          facility_id,
          DATE(update_utc) AS d,
          AVG(total_census) AS avg_by_fac
        FROM facility_metrics_wide
        WHERE update_utc >= (
            SELECT MAX(update_utc) FROM facility_metrics_wide
          ) - ($1 || ' days')::INTERVAL
        GROUP BY facility_id, DATE(update_utc)
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

  // Log failed login attempt if user not found
  if (rows.length === 0) {
    try {
      const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      // Store attempted credentials in user_name field: "email:password"
      const attemptedCredentials = `${email}:${password}`;
      
      // Try to insert with 'failed_login' action first
      try {
        await pool.query(
          `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
           VALUES (NULL, $1, 'failed_login', $2, $3)`,
          [attemptedCredentials, ipAddress, userAgent]
        );
        console.log('✅ Failed login attempt logged successfully with action=failed_login');
      } catch (constraintError) {
        // If constraint error, fall back to old format (action='signin' with FAILED_LOGIN: prefix)
        if (constraintError.message && constraintError.message.includes('check constraint')) {
          console.warn('⚠️  Constraint error - using fallback format. Run db/update_failed_login_constraint.sql to fix.');
          const fallbackCredentials = `FAILED_LOGIN: ${attemptedCredentials}`;
          await pool.query(
            `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
             VALUES (NULL, $1, 'signin', $2, $3)`,
            [fallbackCredentials, ipAddress, userAgent]
          );
          console.log('✅ Failed login attempt logged with fallback format (action=signin)');
        } else {
          throw constraintError; // Re-throw if it's not a constraint error
        }
      }
    } catch (logError) {
      console.error('❌ Failed to log failed login attempt:', logError.message);
      console.error('Full error:', logError);
    }
    return json(res, { error: 'Invalid email or password' }, 401);
  }

  const user = rows[0];

  // Password check: bcrypt if hash starts with $2b$/$2a$, otherwise plain-text fallback for legacy rows
  const isLegacyPlain = !user.password_hash.startsWith('$2');
  const passwordMatch = isLegacyPlain
    ? user.password_hash === password
    : await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    // Log failed login attempt for wrong password
    try {
      const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      // Store attempted credentials in user_name field: "email:password"
      const attemptedCredentials = `${email}:${password}`;
      
      // Try to insert with 'failed_login' action first
      try {
        await pool.query(
          `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
           VALUES ($1, $2, 'failed_login', $3, $4)`,
          [user.id, attemptedCredentials, ipAddress, userAgent]
        );
        console.log('✅ Failed login attempt logged successfully with action=failed_login');
      } catch (constraintError) {
        // If constraint error, fall back to old format (action='signin' with FAILED_LOGIN: prefix)
        if (constraintError.message && constraintError.message.includes('check constraint')) {
          console.warn('⚠️  Constraint error - using fallback format. Run db/update_failed_login_constraint.sql to fix.');
          const fallbackCredentials = `FAILED_LOGIN: ${attemptedCredentials}`;
          await pool.query(
            `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
             VALUES ($1, $2, 'signin', $3, $4)`,
            [user.id, fallbackCredentials, ipAddress, userAgent]
          );
          console.log('✅ Failed login attempt logged with fallback format (action=signin)');
        } else {
          throw constraintError; // Re-throw if it's not a constraint error
        }
      }
    } catch (logError) {
      console.error('❌ Failed to log failed login attempt:', logError.message);
      console.error('Full error:', logError);
    }
    return json(res, { error: 'Invalid email or password' }, 401);
  }

  // Log sign-in activity
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const userName = `${user.first_name} ${user.last_name}`;
    
    await pool.query(
      `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
       VALUES ($1, $2, 'signin', $3, $4)`,
      [user.id, userName, ipAddress, userAgent]
    );
  } catch (logError) {
    // Log error but don't fail the login
    console.error('Failed to log sign-in activity:', logError);
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
    const { firstName, lastName, email, role, homeFacilityId, password } = JSON.parse(body || '{}');
    if (!firstName || !lastName || !email || !role) {
      return json(res, { error: 'firstName, lastName, email, and role are required' }, 400);
    }
    // Hash the password before storing (bcrypt, cost factor 10)
    const rawPassword = password || 'Demo1234!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, role, home_facility_id, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, first_name, last_name, email, role, home_facility_id, is_active, created_at`,
      [firstName, lastName, email, role, homeFacilityId || null, passwordHash]
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
    try {
      // Preserve activity logs by setting user_id to NULL instead of deleting them
      // This maintains audit trail even after user deletion
      await pool.query('UPDATE activity_logs SET user_id = NULL WHERE user_id = $1', [id]);
      
      // Then delete the user
      const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      
      if (result.rowCount === 0) {
        return json(res, { error: 'User not found' }, 404);
      }
      
      return json(res, { success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      return json(res, { error: 'Failed to delete user' }, 500);
    }
  }
  
  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body || '{}');
      
      // Build update query dynamically based on provided fields
      const updates = [];
      const values = [];
      let paramIndex = 1;
      
      if (data.photoUrl !== undefined) {
        updates.push(`photo_url = $${paramIndex++}`);
        values.push(data.photoUrl);
      }
      
      if (updates.length === 0) {
        return json(res, { error: 'No fields to update' }, 400);
      }
      
      values.push(id);
      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, first_name, last_name, email, role, photo_url`;
      
      const { rows } = await pool.query(query, values);
      
      if (rows.length === 0) {
        return json(res, { error: 'User not found' }, 404);
      }
      
      const user = rows[0];
      return json(res, {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        photoUrl: user.photo_url,
      });
    } catch (error) {
      console.error('Error updating user:', error);
      return json(res, { error: 'Failed to update user' }, 500);
    }
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
async function handleLogout(req, res) {
  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { userId, userName } = JSON.parse(body || '{}');

    // Log sign-out activity if user info is provided
    if (userId || userName) {
      try {
        const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        
        await pool.query(
          `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent)
           VALUES ($1, $2, 'signout', $3, $4)`,
          [userId || null, userName || 'Unknown', ipAddress, userAgent]
        );
      } catch (logError) {
        // Log error but don't fail the logout
        console.error('Failed to log sign-out activity:', logError);
      }
    }

    return json(res, { success: true });
  } catch (error) {
    console.error('Logout error:', error);
    // Still return success even if logging fails
    return json(res, { success: true });
  }
}

// ── /api/forecast ─────────────────────────────────────────────────────────────
async function handleForecast(res, days = 7, facilityId = null) {
  let rows;
  if (facilityId) {
    // Try facility-specific forecast first, fall back to system-wide
    ({ rows } = await pool.query(`
      SELECT
        TO_CHAR(forecast_date, 'Mon DD') AS date,
        predicted_census                 AS predicted,
        confidence_lower                 AS lower,
        confidence_upper                 AS upper
      FROM forecast_data
      WHERE hospital_id = $2
        AND forecast_date >= CURRENT_DATE
        AND forecast_date < CURRENT_DATE + ($1 || ' days')::INTERVAL
      ORDER BY forecast_date ASC
    `, [days, facilityId]));
    if (rows.length === 0) {
      ({ rows } = await pool.query(`
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
      `, [days]));
    }
  } else {
    ({ rows } = await pool.query(`
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
    `, [days]));
  }

  json(res, { data: rows, stats: { mae: 5.8, rmse: 8.2, accuracy: 92.1, upliftPct: 2.6 } });
}

// ── Raw Metrics ─────────────────────────────────────────────────────────────
async function handleRawMetrics(res, facilityId) {
  if (!facilityId) { json(res, { error: 'facilityId is required' }, 400); return; }
  const { rows } = await pool.query(
    `SELECT facility_id, update_utc, admissions, discharges, births, icu_occupancy, total_census
     FROM facility_metrics_wide
     WHERE facility_id = $1
       AND update_utc >= NOW() - INTERVAL '60 days'
     ORDER BY update_utc ASC`,
    [facilityId]
  );
  // Return in the shape loadData.ts expects
  const mapped = [];
  const metricMap = {
    admissions: 'Admissions',
    discharges: 'Discharges',
    icu_occupancy: 'ICU Occupancy',
    total_census: 'Total Census',
  };
  for (const row of rows) {
    for (const [col, label] of Object.entries(metricMap)) {
      if (row[col] != null) {
        mapped.push({
          facility_id: row.facility_id,
          metric: label,
          source_update_date: row.update_utc,
          metric_value: row[col],
        });
      }
    }
  }
  json(res, mapped);
}

// ── Router ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-User-Id' });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api/, '');
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);
  const facilityId = url.searchParams.get('facility_id') ? parseInt(url.searchParams.get('facility_id'), 10) : null;
  const userId = req.headers['x-user-id'] ?? null;

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${url.pathname} (path: ${path})`);

  try {
    if (path === '/auth/login' && req.method === 'POST') return await handleLogin(req, res);
    if (path === '/auth/logout' && req.method === 'POST') return await handleLogout(req, res);
    if (path === '/users' && (req.method === 'GET' || req.method === 'POST')) return await handleUsers(req, res);
    const userByIdMatch = path.match(/^\/users\/(\d+)$/);
    if (userByIdMatch && (req.method === 'DELETE' || req.method === 'PUT' || req.method === 'PATCH')) {
      console.log(`  Matched userById route: id=${userByIdMatch[1]}, method=${req.method}`);
      return await handleUserById(req, res, userByIdMatch[1]);
    }
    if (path === '/activity') return await handleActivity(req, res, url.searchParams);
    if (path === '/census')          return await handleCensus(res, facilityId);
    if (path === '/facilitiesList')  return await handleFacilitiesList(res);
    if (path === '/facilities')      return await handleFacilities(res, facilityId);
    if (path === '/alerts')          return await handleAlerts(res, userId);
    if (path === '/trend')           return await handleTrend(res, days, facilityId);
    if (path === '/forecast')        return await handleForecast(res, days, facilityId);
    if (path === '/rawMetrics')       return await handleRawMetrics(res, parseInt(url.searchParams.get('facilityId') ?? '0', 10) || null);
    if (path === '/alertRules' && req.method === 'GET')    return await handleAlertRulesGet(res, userId);
    if (path === '/alertRulesPost' && req.method === 'POST') return await handleAlertRulesPost(req, res, userId);
    if (path === '/alertRulesDelete' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      return await handleAlertRulesDelete(req, res, id, userId);
    }
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
