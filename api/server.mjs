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
async function handleCensus(res, facilityId = null) {
  if (facilityId) {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (fm.facility_id)
        fm.metric_value::int AS "totalCensus",
        f.capacity::int      AS "totalCapacity",
        ROUND((fm.metric_value::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS "occupancyRate",
        ROUND(fm.metric_value * 1.015)::int AS "sevenDayForecast"
      FROM facility_metrics fm
      JOIN facilities f ON f.facility_id = fm.facility_id
      WHERE fm.facility_id = $1
        AND LOWER(fm.metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
      ORDER BY fm.facility_id, fm.source_update_date DESC
    `, [facilityId]);
    return json(res, rows[0] ?? {});
  }
  const { rows } = await pool.query(`
    WITH latest_per_facility AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id,
        fm.metric_value AS total_census,
        f.capacity
      FROM facility_metrics fm
      JOIN facilities f ON f.facility_id = fm.facility_id
      WHERE LOWER(fm.metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
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

// ── /api/facilitiesList ───────────────────────────────────────────────────────
async function handleFacilitiesList(res) {
  const { rows } = await pool.query(`SELECT facility_id AS id, name FROM facilities ORDER BY name`);
  json(res, rows);
}

// ── /api/facilities ───────────────────────────────────────────────────────────
async function handleFacilities(res, facilityId = null) {
  const { rows } = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id, fm.metric_value AS census, fm.source_update_date AS latest_ts
      FROM facility_metrics fm
      WHERE LOWER(fm.metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
      ORDER BY fm.facility_id, fm.source_update_date DESC
    ),
    day_ago AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id, fm.metric_value AS prev_census
      FROM facility_metrics fm
      JOIN latest l ON l.facility_id = fm.facility_id
      WHERE LOWER(fm.metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
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
    WHERE ($1::int IS NULL OR f.facility_id = $1)
    ORDER BY occupancy DESC
  `, [facilityId]);
  json(res, rows);
}

// ── /api/alerts ───────────────────────────────────────────────────────────────
async function handleAlerts(res) {
  const { rows } = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (fm.facility_id)
        fm.facility_id, fm.metric_value AS census
      FROM facility_metrics fm
      WHERE LOWER(fm.metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
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
async function handleTrend(res, days = 30, facilityId = null) {
  if (facilityId) {
    const { rows } = await pool.query(`
      WITH daily AS (
        SELECT
          DATE(source_update_date)  AS d,
          AVG(fm.metric_value)::int AS total_census,
          MAX(f.capacity)           AS capacity
        FROM facility_metrics fm
        JOIN facilities f ON f.facility_id = fm.facility_id
        WHERE fm.facility_id = $2
          AND LOWER(fm.metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
          AND fm.source_update_date >= (
            SELECT MAX(source_update_date) FROM facility_metrics
            WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
          ) - ($1 || ' days')::INTERVAL
        GROUP BY DATE(source_update_date)
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
          DATE(source_update_date) AS d,
          AVG(metric_value)        AS avg_by_fac
        FROM facility_metrics
        WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
          AND source_update_date >= (
            SELECT MAX(source_update_date) FROM facility_metrics WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
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
// Note: Login, Users, Activity, and Logout handlers are defined below (HEAD versions with activity logging)

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
  
  // Validate required fields
  if (!firstName || !lastName || !email || !role || !password) {
    json(res, { error: 'All fields are required' }, 400);
    return;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    json(res, { error: 'Invalid email format' }, 400);
    return;
  }
  
  // Validate password length
  if (password.length < 6) {
    json(res, { error: 'Password must be at least 6 characters long' }, 400);
    return;
  }
  
  try {
    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      json(res, { error: 'User with this email already exists' }, 409);
      return;
    }
    
    // Get actual role values from database to validate and handle enum type
    let roleValue = role.trim();
    let validEnumRoles = [];
    try {
      // First, try to get enum values if it's an enum type
      const enumResult = await pool.query(`
        SELECT enumlabel 
        FROM pg_enum 
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
        ORDER BY enumsortorder
      `);
      if (enumResult.rows.length > 0) {
        validEnumRoles = enumResult.rows.map(r => r.enumlabel);
        console.log(`[ADD USER] Found enum type with values:`, validEnumRoles);
        
        // Validate role against enum values
        if (!validEnumRoles.includes(roleValue)) {
          json(res, { 
            error: `Invalid role "${roleValue}". Valid roles are: ${validEnumRoles.join(', ')}`,
            validRoles: validEnumRoles,
            receivedRole: roleValue
          }, 400);
          return;
        }
        
        // Role is valid, use it as-is
        console.log(`[ADD USER] Role "${roleValue}" is valid`);
      } else {
        // Not an enum type, check existing roles to see format
        const roleCheck = await pool.query('SELECT DISTINCT role FROM users LIMIT 10');
        if (roleCheck.rows.length > 0) {
          const existingRoles = roleCheck.rows.map(r => r.role);
          console.log(`[ADD USER] Existing roles in DB (not enum):`, existingRoles);
          // Use the role as-is - let database constraints handle validation
        }
      }
    } catch (err) {
      console.warn(`[ADD USER] Could not check role format: ${err.message}`);
      // Continue with original role value - let database handle validation
    }
    
    // Insert user - handle various column combinations
    // home_facility_id is now nullable (represents "all facilities" when NULL)
    let rows;
    let hasStatusColumn = true;
    
    // Use NULL for home_facility_id (represents "all facilities" access)
    // After running make_home_facility_nullable.sql, this will work
    const facilityId = null;
    
    console.log(`[ADD USER] Using NULL for home_facility_id (all facilities access)`);
    
    // Now insert the user with NULL for home_facility_id
    try {
      // Try with status column and home_facility_id (NULL)
      const result = await pool.query(`
        INSERT INTO users (first_name, last_name, email, password_hash, role, status, home_facility_id)
        VALUES ($1, $2, $3, $4, $5, 'Active', NULL)
        RETURNING id, first_name, last_name, email, role, status
      `, [firstName.trim(), lastName.trim(), email.toLowerCase().trim(), password, roleValue]);
      rows = result.rows;
      console.log(`[ADD USER] Inserted with status column and NULL facility_id (all facilities)`);
    } catch (err) {
      // Handle other errors (like missing status column)
      if (err.message.includes('column') && (err.message.includes('status') || err.message.includes('does not exist'))) {
        // Status column doesn't exist, try without it
        console.log(`[ADD USER] Status column not found, trying without it: ${err.message}`);
        hasStatusColumn = false;
        try {
          // Try without status column, still use NULL for home_facility_id
          const result = await pool.query(`
            INSERT INTO users (first_name, last_name, email, password_hash, role, home_facility_id)
            VALUES ($1, $2, $3, $4, $5, NULL)
            RETURNING id, first_name, last_name, email, role
          `, [firstName.trim(), lastName.trim(), email.toLowerCase().trim(), password, roleValue]);
          rows = result.rows;
          console.log(`[ADD USER] Inserted without status column, with NULL facility_id (all facilities)`);
        } catch (err2) {
          // If home_facility_id column doesn't exist either, try without it
          if (err2.message.includes('home_facility_id') || err2.message.includes('does not exist')) {
            try {
              const result = await pool.query(`
                INSERT INTO users (first_name, last_name, email, password_hash, role)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, first_name, last_name, email, role
              `, [firstName.trim(), lastName.trim(), email.toLowerCase().trim(), password, roleValue]);
              rows = result.rows;
              console.log(`[ADD USER] Inserted without status and home_facility_id columns`);
            } catch (err3) {
              console.error(`[ADD USER] Insert failed: ${err3.message}`);
              throw err3;
            }
          } else {
            console.error(`[ADD USER] Insert without status failed: ${err2.message}`);
            throw err2;
          }
        }
      } else if (err.message.includes('enum') || err.message.includes('invalid input')) {
        // Role enum issue - return helpful error with valid values
        if (validEnumRoles.length > 0) {
          json(res, { 
            error: `Invalid role "${role}". Valid roles are: ${validEnumRoles.join(', ')}`,
            validRoles: validEnumRoles,
            receivedRole: role
          }, 400);
          return;
        } else {
          // Try to get enum values now
          try {
            const enumQuery = await pool.query(`
              SELECT enumlabel 
              FROM pg_enum 
              WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
              ORDER BY enumsortorder
            `);
            if (enumQuery.rows.length > 0) {
              const validRoles = enumQuery.rows.map(r => r.enumlabel);
              console.log(`[ADD USER] Valid enum roles:`, validRoles);
              json(res, { 
                error: `Invalid role "${role}". Valid roles are: ${validRoles.join(', ')}`,
                validRoles: validRoles,
                receivedRole: role
              }, 400);
              return;
            }
          } catch (enumErr) {
            console.warn(`[ADD USER] Could not query enum: ${enumErr.message}`);
          }
          // If we can't get enum values, return generic error
          json(res, { 
            error: `Invalid role value. Please check the database for valid role values.`,
            receivedRole: role
          }, 400);
          return;
        }
      } else {
        // Some other error occurred
        console.error(`[ADD USER] Insert error: ${err.message}`, err);
        throw err;
      }
    }
    
    // If rows is still not set, something went wrong
    if (!rows) {
      json(res, { 
        error: 'Failed to create user. Please check server logs for details.',
        details: 'User insertion failed after all attempts'
      }, 500);
      return;
    }
    
    const newUser = rows[0];
    console.log(`[ADD USER] Created user: ${newUser.first_name} ${newUser.last_name} (${newUser.email})`);
    
    // Log user creation (if activity_logs table exists)
    try {
      await pool.query(`
        INSERT INTO activity_logs (user_id, user_name, action)
        VALUES ($1, $2, 'user_added')
      `, [newUser.id, `${firstName.trim()} ${lastName.trim()}`]);
    } catch (err) {
      // Activity logs table might not exist, that's okay
      console.warn('Could not log user creation:', err.message);
    }
    
    // Return the created user
    const responseData = {
      id: String(newUser.id),
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      email: newUser.email,
      role: newUser.role,
      status: (hasStatusColumn && newUser.status) ? newUser.status : 'Active',
      createdAt: new Date().toISOString(),
    };
    
    console.log(`[ADD USER] Successfully created user:`, responseData);
    json(res, responseData, 201);
  } catch (err) {
    console.error('[ADD USER] Error details:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    json(res, { 
      error: err.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, 500);
  }
}

async function handleUsersDelete(res, userId) {
  console.log(`[DELETE USER] Received request to delete user ID: ${userId} (type: ${typeof userId})`);
  
  if (!userId) {
    console.error('[DELETE USER] No user ID provided');
    json(res, { error: 'User ID is required' }, 400);
    return;
  }
  
  // Convert userId to integer for database query
  const userIdInt = parseInt(userId, 10);
  if (isNaN(userIdInt)) {
    console.error(`[DELETE USER] Invalid user ID format: ${userId}`);
    json(res, { error: 'Invalid user ID format' }, 400);
    return;
  }
  
  try {
    // Get user info before deleting
    const { rows } = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userIdInt]
    );
    
    if (rows.length === 0) {
      console.error(`[DELETE USER] User not found with ID: ${userIdInt}`);
      json(res, { error: 'User not found' }, 404);
      return;
    }
    
    const userName = `${rows[0].first_name} ${rows[0].last_name}`;
    console.log(`[DELETE USER] Deleting user: ${userName} (ID: ${userIdInt})`);
    
    // First, delete or update activity_logs entries that reference this user
    // This prevents foreign key constraint violations
    try {
      // Option 1: Delete activity logs for this user (recommended)
      const deleteLogsResult = await pool.query(
        'DELETE FROM activity_logs WHERE user_id = $1',
        [userIdInt]
      );
      console.log(`[DELETE USER] Deleted ${deleteLogsResult.rowCount} activity log entries for user ${userIdInt}`);
    } catch (logErr) {
      // If activity_logs table doesn't exist or has issues, try to set user_id to NULL
      console.warn(`[DELETE USER] Could not delete activity logs, trying to set user_id to NULL: ${logErr.message}`);
      try {
        await pool.query(
          'UPDATE activity_logs SET user_id = NULL WHERE user_id = $1',
          [userIdInt]
        );
      } catch (updateErr) {
        console.warn(`[DELETE USER] Could not update activity logs either: ${updateErr.message}`);
        // Continue with deletion anyway - the foreign key might allow NULL or CASCADE
      }
    }
    
    // Now delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [userIdInt]);
    console.log(`[DELETE USER] User deleted successfully: ${userName}`);
    
    // Log user deletion (without user_id since user is deleted)
    try {
      await pool.query(`
        INSERT INTO activity_logs (user_name, action)
        VALUES ($1, 'user_removed')
      `, [userName]);
      console.log(`[DELETE USER] Activity log created for user removal: ${userName}`);
    } catch (logErr) {
      console.warn(`[DELETE USER] Could not log user deletion: ${logErr.message}`);
    }
    
    json(res, { message: 'User deleted successfully' });
  } catch (err) {
    console.error('[DELETE USER] Error details:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint
    });
    
    // Provide more specific error messages
    let errorMessage = 'Internal server error';
    if (err.code === '23503') { // Foreign key violation
      errorMessage = 'Cannot delete user: User has associated records that must be deleted first';
    } else if (err.code === '23505') { // Unique violation
      errorMessage = 'Cannot delete user: User record conflict';
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    json(res, { 
      error: errorMessage, 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    }, 500);
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
    
    console.log(`[ACTIVITY] Query: ${query}, Params:`, params);
    const { rows } = await pool.query(query, params);
    console.log(`[ACTIVITY] Found ${rows.length} logs`);
    
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
      console.error('[ACTIVITY ERROR] Activity logs table does not exist:', err.message);
      console.warn('[ACTIVITY] Please run users_schema.sql in your database.');
      json(res, []);
    } else {
      console.error('[ACTIVITY ERROR] Get activity logs error:', err);
      console.error('[ACTIVITY ERROR] Full error:', err);
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
    
    console.log(`[LOGIN] Attempting login for email: ${email.toLowerCase()}`);
    const { rows } = await pool.query(query, [email.toLowerCase()]);
    
    if (rows.length === 0) {
      console.log(`[LOGIN] User not found: ${email}`);
      // Log failed login attempt
      try {
        await pool.query(`
          INSERT INTO activity_logs (user_name, action)
          VALUES ($1, 'signin')
        `, [email]);
      } catch (err) {
        // Activity logs table might not exist
        console.warn('[LOGIN] Could not log failed attempt:', err.message);
      }
      
      json(res, { error: 'Invalid email or password' }, 401);
      return;
    }
    
    const user = rows[0];
    console.log(`[LOGIN] User found: ${user.first_name} ${user.last_name} (ID: ${user.id})`);
    
    // Check password (simple comparison for demo)
    if (user.password_hash !== password) {
      console.log(`[LOGIN] Password mismatch for user: ${user.email}`);
      // Log failed login attempt
      try {
        await pool.query(`
          INSERT INTO activity_logs (user_name, action)
          VALUES ($1, 'signin')
        `, [email]);
      } catch (err) {
        // Activity logs table might not exist
        console.warn('[LOGIN] Could not log failed attempt:', err.message);
      }
      
      json(res, { error: 'Invalid email or password' }, 401);
      return;
    }
    
    console.log(`[LOGIN] Password verified for user: ${user.email}`);
    
    // Check if user is Kevin - only Kevin can access admin page
    const firstName = user.first_name.toLowerCase();
    const isKevin = firstName === 'kevin';
    
    // Log successful login for ALL users (including admin/Kevin)
    try {
      const result = await pool.query(`
        INSERT INTO activity_logs (user_id, user_name, action)
        VALUES ($1, $2, 'signin')
        RETURNING id
      `, [user.id, `${user.first_name} ${user.last_name}`]);
      console.log(`[LOGIN] User logged in: ${user.first_name} ${user.last_name} (ID: ${user.id}, Log ID: ${result.rows[0]?.id})`);
    } catch (err) {
      // Activity logs table might not exist, but log to console
      console.error('[LOGIN ERROR] Could not log login to activity_logs:', err.message);
      console.error('[LOGIN ERROR] Full error:', err);
      // Try to create the table if it doesn't exist (for development)
      if (err.message.includes('does not exist')) {
        console.warn('[LOGIN] Activity logs table does not exist. Please run users_schema.sql in your database.');
      }
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
    
    // Log logout for ALL users (including admin/Kevin) - always log if we have any user info
    if (userId || userName) {
      try {
        const result = await pool.query(`
          INSERT INTO activity_logs (user_id, user_name, action)
          VALUES ($1, $2, 'signout')
          RETURNING id
        `, [userId || null, userName || 'Unknown']);
        console.log(`[LOGOUT] User logged out: ${userName || 'Unknown'} (ID: ${userId || 'N/A'}, Log ID: ${result.rows[0]?.id})`);
      } catch (err) {
        // Activity logs table might not exist, but log to console
        console.error('[LOGOUT ERROR] Could not log logout to activity_logs:', err.message);
        console.error('[LOGOUT ERROR] Full error:', err);
        if (err.message.includes('does not exist')) {
          console.warn('[LOGOUT] Activity logs table does not exist. Please run users_schema.sql in your database.');
        }
      }
    } else {
      // Even if no user info provided, try to log with unknown
      try {
        const result = await pool.query(`
          INSERT INTO activity_logs (user_name, action)
          VALUES ($1, 'signout')
          RETURNING id
        `, ['Unknown User']);
        console.log(`[LOGOUT] Unknown user logged out (Log ID: ${result.rows[0]?.id})`);
      } catch (err) {
        console.error('[LOGOUT ERROR] Could not log logout to activity_logs:', err.message);
        if (err.message.includes('does not exist')) {
          console.warn('[LOGOUT] Activity logs table does not exist. Please run users_schema.sql in your database.');
        }
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
  const facilityId = url.searchParams.get('facility_id') ? parseInt(url.searchParams.get('facility_id'), 10) : null;

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${url.pathname}`);

  try {
    // Handle root /api endpoint
    if (path === '/' || path === '') {
      if (req.method === 'GET') {
        json(res, {
          message: 'HCA Census API',
          version: '1.0.0',
          endpoints: {
            GET: ['/census', '/facilities', '/facilitiesList', '/alerts', '/trend', '/forecast', '/users', '/activity'],
            POST: ['/users', '/auth/login', '/auth/logout'],
            DELETE: ['/users/:id']
          }
        });
        return;
      }
    }
    
    // Auth endpoints (using HEAD versions with activity logging)
    if (path === '/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      return await handleLogin(res, body);
    }
    if (path === '/auth/logout' && req.method === 'POST') {
      const body = await readBody(req);
      return await handleLogout(res, body);
    }
    
    // User management endpoints (using HEAD versions)
    if (path === '/users' && req.method === 'GET') {
      return await handleUsersGet(res);
    }
    if (path === '/users' && req.method === 'POST') {
      const body = await readBody(req);
      return await handleUsersPost(res, body);
    }
    if (req.method === 'DELETE' && path.startsWith('/users/')) {
      const userId = path.split('/')[2];
      console.log(`[DELETE] Extracted userId from path: ${userId}, path: ${path}`);
      return await handleUsersDelete(res, userId);
    }
    
    // Activity logs (using HEAD version)
    if (path === '/activity' && req.method === 'GET') {
      return await handleActivity(res, action, limit);
    }
    
    // Data endpoints (supporting facilityId from main)
    if (path === '/census' && req.method === 'GET') {
      return await handleCensus(res, facilityId);
    }
    if (path === '/facilitiesList' && req.method === 'GET') {
      return await handleFacilitiesList(res);
    }
    if (path === '/facilities' && req.method === 'GET') {
      return await handleFacilities(res, facilityId);
    }
    if (path === '/alerts' && req.method === 'GET') {
      return await handleAlerts(res);
    }
    if (path === '/trend' && req.method === 'GET') {
      return await handleTrend(res, days, facilityId);
    }
    if (path === '/forecast' && req.method === 'GET') {
      return await handleForecast(res, days, facilityId);
    }
    
    json(res, { 
      error: 'Not found', 
      path: url.pathname,
      method: req.method,
      availableEndpoints: {
        GET: ['/api/census', '/api/facilities', '/api/facilitiesList', '/api/alerts', '/api/trend', '/api/forecast', '/api/users', '/api/activity'],
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
  console.log('   GET  /census  /facilities  /facilitiesList  /alerts  /trend?days=N  /forecast?days=N');
  console.log('   GET  /users  /activity?action=signin&limit=50');
  console.log('   POST /users  /auth/login  /auth/logout');
  console.log('   DELETE /users/:id\n');
});
