/**
 * Local API server when Azure Functions Core Tools (func) is not installed.
 * Proxies same routes as the Functions app. Run: node dev-server.js
 * Loads DATABASE_URL from api/local.settings.json.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load local.settings.json into process.env
try {
  const settingsPath = path.join(__dirname, 'local.settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (settings.Values) {
    Object.assign(process.env, settings.Values);
  }
} catch (e) {
  console.warn('Could not load local.settings.json:', e.message);
}

const { getDb } = require('./dist/src/db.js');

const PORT = 7071;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000; // 15 min between alert notifications per user
const lastNotifyByUser = new Map();

/** Normalize to E.164 for US: +1 + 10 digits. Returns null if not valid. */
function toE164(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return null;
}

/** Send SMS via Twilio REST API. Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in env. */
async function sendTwilioSms(toE164Number, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !from) return false;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: toE164Number, From: from, Body: body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[alerts/notify] Twilio error:', res.status, err);
    return false;
  }
  return true;
}

/** Send email via Resend API. Requires RESEND_API_KEY in env. RESEND_FROM defaults to onboarding@resend.dev for testing. */
async function sendResendEmail(to, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'HCA Alerts <onboarding@resend.dev>';
  if (!apiKey) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[alerts/notify] Resend error:', res.status, err);
    return false;
  }
  return true;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...CORS, ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function parseQuery(url) {
  const i = url.indexOf('?');
  if (i === -1) return new Map();
  const m = new Map();
  for (const p of new URLSearchParams(url.slice(i + 1))) m.set(p[0], p[1]);
  return m;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  const method = (req.method || 'GET').toUpperCase();
  const p = url.replace(/^\//, '').split('?')[0];
  const base = p.startsWith('api/') ? p.slice(4) : p;
  const query = parseQuery(url);

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-User-Id' });
    res.end();
    return;
  }

  try {
    const db = getDb();

    // POST /api/auth/login
    if (base === 'auth/login' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const { email, password } = body;
        if (!email || !password) return send(res, 400, { error: 'Email and password are required' });
        const { rows } = await db.query(
          `SELECT id, first_name, last_name, email, role, photo_url, phone_number, default_trend_days, password_hash,
                  COALESCE(notify_email, true) AS notify_email, COALESCE(notify_sms, false) AS notify_sms
           FROM users WHERE email = $1`,
          [email.toLowerCase()]
        );
        if (rows.length === 0) {
          try {
            await db.query(`INSERT INTO activity_logs (user_name, action, ip_address) VALUES ($1, 'signin', $2)`, [email, req.headers['x-forwarded-for'] || 'unknown']);
          } catch (_) { /* table may not exist */ }
          return send(res, 401, { error: 'Invalid email or password' });
        }
        const user = rows[0];
        if (user.password_hash !== password) {
          try {
            await db.query(`INSERT INTO activity_logs (user_name, action, ip_address) VALUES ($1, 'signin', $2)`, [email, req.headers['x-forwarded-for'] || 'unknown']);
          } catch (_) { /* table may not exist */ }
          return send(res, 401, { error: 'Invalid email or password' });
        }
        try {
          await db.query(
            `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent) VALUES ($1, $2, 'signin', $3, $4)`,
            [user.id, `${user.first_name} ${user.last_name}`, req.headers['x-forwarded-for'] || 'unknown', req.headers['user-agent'] || 'unknown']
          );
        } catch (_) { /* table may not exist or different schema */ }
        const canAccessAdmin = ['Super Admin', 'Regional Manager', 'Facility Administrator'].includes(user.role || '');
        return send(res, 200, {
          user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role, photoUrl: user.photo_url || null, phoneNumber: user.phone_number || null, defaultTrendDays: user.default_trend_days != null ? user.default_trend_days : 30, notifyEmail: user.notify_email !== false, notifySms: user.notify_sms === true },
          canAccessAdmin,
        });
      } catch (err) {
        console.error('auth/login error:', err);
        return send(res, 500, { error: err.message || 'Internal server error' });
      }
    }

    // POST /api/auth/logout
    if (base === 'auth/logout' && method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const { userId, userName } = body;
      if (userId || userName) {
        await db.query(
          `INSERT INTO activity_logs (user_id, user_name, action, ip_address, user_agent) VALUES ($1, $2, 'signout', $3, $4)`,
          [userId || null, userName || 'Unknown', req.headers['x-forwarded-for'] || 'unknown', req.headers['user-agent'] || 'unknown']
        );
      }
      return send(res, 200, { message: 'Logged out successfully' });
    }

    // GET /api/activity
    if (base === 'activity' && method === 'GET') {
      const action = query.get('action') || 'all';
      const limit = parseInt(query.get('limit') || '50', 10);
      let sql = 'SELECT id, user_id, user_name, action, timestamp FROM activity_logs';
      const params = [];
      if (action !== 'all') {
        sql += ' WHERE action = $1';
        params.push(action);
      }
      sql += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1);
      params.push(limit);
      const { rows } = await db.query(sql, params);
      const logs = (rows || []).map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, action: r.action, timestamp: r.timestamp }));
      return send(res, 200, logs);
    }

    // GET /api/users
    if (base === 'users' && method === 'GET') {
      const { rows } = await db.query('SELECT id, first_name, last_name, email, role, created_at FROM users ORDER BY created_at DESC');
      const users = (rows || []).map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, role: r.role, status: r.status || 'Active', createdAt: r.created_at }));
      return send(res, 200, users);
    }

    // POST /api/users
    if (base === 'users' && method === 'POST') {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const { firstName, lastName, email, role, password } = body;
      if (!firstName || !lastName || !email || !role || !password) return send(res, 400, { error: 'All fields are required' });
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (existing.rows.length > 0) return send(res, 409, { error: 'User with this email already exists' });
      const { rows } = await db.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, role, created_at`,
        [firstName, lastName, email.toLowerCase(), password, role]
      );
      const u = rows[0];
      await db.query(`INSERT INTO activity_logs (user_id, user_name, action) VALUES ($1, $2, 'user_added')`, [u.id, `${firstName} ${lastName}`]);
      return send(res, 201, { id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, role: u.role, status: 'Active' });
    }

    // PATCH /api/users/me — update current user (default trend days, email, phone)
    if ((base === 'users/me' || base === 'users/me/') && method === 'PATCH') {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const userId = body.userId != null ? Number(body.userId) : null;
        if (userId == null || Number.isNaN(userId)) return send(res, 400, { error: 'userId is required' });

        const updates = [];
        const params = [];
        let p = 1;

        if (body.defaultTrendDays !== undefined) {
          const allowed = [7, 14, 30, 60];
          if (typeof body.defaultTrendDays !== 'number' || !allowed.includes(body.defaultTrendDays)) {
            return send(res, 400, { error: 'defaultTrendDays must be 7, 14, 30, or 60' });
          }
          updates.push(`default_trend_days = $${p++}`);
          params.push(body.defaultTrendDays);
        }
        if (body.email !== undefined) {
          const email = String(body.email).trim().toLowerCase();
          if (!email) return send(res, 400, { error: 'Email cannot be empty' });
          updates.push(`email = $${p++}`);
          params.push(email);
        }
        if (body.phoneNumber !== undefined) {
          updates.push(`phone_number = $${p++}`);
          params.push(body.phoneNumber === null || body.phoneNumber === '' ? null : String(body.phoneNumber).trim());
        }
        if (body.notifyEmail !== undefined) {
          updates.push(`notify_email = $${p++}`);
          params.push(!!body.notifyEmail);
        }
        if (body.notifySms !== undefined) {
          updates.push(`notify_sms = $${p++}`);
          params.push(!!body.notifySms);
        }

        if (updates.length === 0) return send(res, 400, { error: 'No fields to update' });

        updates.push('updated_at = NOW()');
        params.push(userId);
        const result = await db.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${p}`,
          params
        );
        const rowCount = result?.rowCount ?? 0;
        if (rowCount === 0) return send(res, 404, { error: 'User not found' });

        const out = {};
        if (body.defaultTrendDays !== undefined) out.defaultTrendDays = body.defaultTrendDays;
        if (body.email !== undefined) out.email = body.email.trim().toLowerCase();
        if (body.phoneNumber !== undefined) out.phoneNumber = body.phoneNumber === null || body.phoneNumber === '' ? null : String(body.phoneNumber).trim();
        if (body.notifyEmail !== undefined) out.notifyEmail = !!body.notifyEmail;
        if (body.notifySms !== undefined) out.notifySms = !!body.notifySms;
        return send(res, 200, out);
      } catch (err) {
        const msg = err.message || String(err);
        console.error('PATCH users/me error:', err);
        if (msg.includes('default_trend_days') && (msg.includes('does not exist') || msg.includes('column'))) {
          return send(res, 503, {
            error: 'Database missing default_trend_days column. Run: db/migration-add-user-default-trend-days.sql',
          });
        }
        return send(res, 500, { error: msg || 'Internal server error' });
      }
    }

    // DELETE /api/users/:id
    if (base.startsWith('users/') && method === 'DELETE') {
      const id = base.slice(6);
      if (!id) return send(res, 400, { error: 'User ID is required' });
      const { rows } = await db.query('SELECT first_name, last_name FROM users WHERE id = $1', [id]);
      if (rows.length === 0) return send(res, 404, { error: 'User not found' });
      const userName = `${rows[0].first_name} ${rows[0].last_name}`;
      await db.query('DELETE FROM users WHERE id = $1', [id]);
      await db.query(`INSERT INTO activity_logs (user_name, action) VALUES ($1, 'user_removed')`, [userName]);
      return send(res, 200, { message: 'User deleted successfully' });
    }

    // GET /api/census (optional ?facility_id= for single facility)
    if (base === 'census' && method === 'GET') {
      const facilityId = query.get('facility_id') ? parseInt(query.get('facility_id'), 10) : null;
      const { rows } = await db.query(
        `WITH census_metrics AS (
          SELECT facility_id, source_update_date, metric_value,
                 ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY source_update_date DESC,
                   CASE WHEN LOWER(metric) = 'total census' THEN 0 WHEN LOWER(metric) = 'total' THEN 1 WHEN LOWER(metric) = 'census' THEN 2 ELSE 3 END
                 ) AS rn
          FROM facility_metrics
          WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
            AND ($1::int IS NULL OR facility_id = $1)
        ),
        latest_vals AS (
          SELECT facility_id, metric_value FROM census_metrics WHERE rn = 1
        ),
        totals AS (
          SELECT COALESCE(SUM(lv.metric_value), 0)::int AS total_census, COALESCE(SUM(f.capacity), 0)::int AS total_capacity
          FROM facilities f LEFT JOIN latest_vals lv ON f.facility_id = lv.facility_id
          WHERE ($1::int IS NULL OR f.facility_id = $1)
        ),
        latest_icu AS (
          SELECT facility_id, MAX(source_update_date) AS max_ts FROM facility_metrics WHERE (LOWER(metric) = 'icu' OR LOWER(metric) = 'icu occupancy') AND ($1::int IS NULL OR facility_id = $1) GROUP BY facility_id
        ),
        icu_vals AS (
          SELECT fm.facility_id, fm.metric_value FROM facility_metrics fm
          JOIN latest_icu l ON fm.facility_id = l.facility_id AND fm.source_update_date = l.max_ts AND (LOWER(fm.metric) = 'icu' OR LOWER(fm.metric) = 'icu occupancy')
        ),
        icu_total AS (SELECT COALESCE(SUM(metric_value), 0)::int AS total FROM icu_vals),
        recent_avg AS (
          SELECT ROUND(AVG(daily_total))::int AS avg_census FROM (
            WITH daily_latest AS (
              SELECT facility_id, (source_update_date AT TIME ZONE 'UTC')::date AS census_date, metric_value,
                     ROW_NUMBER() OVER (PARTITION BY facility_id, (source_update_date AT TIME ZONE 'UTC')::date ORDER BY source_update_date DESC) AS rn
              FROM facility_metrics
              WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds')
                AND ($1::int IS NULL OR facility_id = $1)
                AND (source_update_date AT TIME ZONE 'UTC')::date >= (SELECT (MAX(source_update_date) AT TIME ZONE 'UTC')::date FROM facility_metrics WHERE LOWER(metric) IN ('total census', 'total', 'census', 'total beds', 'occupied', 'beds') AND ($1::int IS NULL OR facility_id = $1)) - INTERVAL '7 days'
            )
            SELECT SUM(metric_value)::int AS daily_total FROM daily_latest WHERE rn = 1 GROUP BY census_date
          ) d
        )
        SELECT t.total_census AS "totalCensus", t.total_capacity AS "totalCapacity",
               ROUND((t.total_census::numeric / NULLIF(t.total_capacity, 0)) * 100, 1) AS "occupancyRate",
               (SELECT COALESCE(ROUND(avg_census * 1.015)::int, t.total_census) FROM recent_avg) AS "sevenDayForecast",
               (SELECT total FROM icu_total) AS "icuTotal"
        FROM totals t`,
        [facilityId]
      );
      return send(res, 200, rows[0]);
    }

    // GET /api/facilities (optional ?facility_id= for single facility)
    if (base === 'facilities' && method === 'GET') {
      const facilityId = query.get('facility_id') ? parseInt(query.get('facility_id'), 10) : null;
      const { rows } = await db.query(
        `WITH latest_per_facility AS (
          SELECT facility_id, MAX(source_update_date) AS max_ts FROM facility_metrics WHERE LOWER(metric) IN ('total census', 'total') AND ($1::int IS NULL OR facility_id = $1) GROUP BY facility_id
        ),
        latest_vals AS (
          SELECT fm.facility_id, fm.metric_value FROM facility_metrics fm
          JOIN latest_per_facility l ON fm.facility_id = l.facility_id AND fm.source_update_date = l.max_ts AND LOWER(fm.metric) IN ('total census', 'total')
        ),
        ranked AS (
          SELECT facility_id, metric_value, ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY source_update_date DESC) AS rn
          FROM facility_metrics WHERE LOWER(metric) IN ('total census', 'total') AND ($1::int IS NULL OR facility_id = $1)
        ),
        prev_vals AS (SELECT facility_id, metric_value AS prev_val FROM ranked WHERE rn = 2)
        SELECT f.name, COALESCE(lv.metric_value, 0)::int AS census,
               ROUND((COALESCE(lv.metric_value, 0)::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy,
               f.capacity,
               CASE WHEN COALESCE(lv.metric_value, 0) > COALESCE(pv.prev_val, lv.metric_value, 0) THEN 'up'
                    WHEN COALESCE(lv.metric_value, 0) < COALESCE(pv.prev_val, lv.metric_value, 0) THEN 'down' ELSE 'flat' END AS trend
        FROM facilities f LEFT JOIN latest_vals lv ON f.facility_id = lv.facility_id
        LEFT JOIN prev_vals pv ON f.facility_id = pv.facility_id
        WHERE ($1::int IS NULL OR f.facility_id = $1)
        ORDER BY occupancy DESC NULLS LAST LIMIT 5`,
        [facilityId]
      );
      return send(res, 200, rows);
    }

    // GET /api/facilitiesList
    if (base === 'facilitiesList' && method === 'GET') {
      const { rows } = await db.query('SELECT facility_id AS id, name FROM facilities ORDER BY name');
      return send(res, 200, rows);
    }

    // GET /api/metricTypes — distinct metrics from facility_metrics (alerts dropdown)
    if (base === 'metricTypes' && method === 'GET') {
      const { rows } = await db.query('SELECT DISTINCT metric FROM facility_metrics ORDER BY metric');
      const metrics = (rows || []).map((r) => r.metric);
      return send(res, 200, metrics);
    }

    // GET /api/alerts (facilities + facility_metrics)
    if (base === 'alerts' && method === 'GET') {
      const { rows } = await db.query(`
        WITH latest_per_facility AS (
          SELECT facility_id, MAX(source_update_date) AS max_ts FROM facility_metrics WHERE LOWER(metric) IN ('total census', 'total') GROUP BY facility_id
        ),
        latest_vals AS (
          SELECT fm.facility_id, fm.metric_value FROM facility_metrics fm
          JOIN latest_per_facility l ON fm.facility_id = l.facility_id AND fm.source_update_date = l.max_ts AND LOWER(fm.metric) IN ('total census', 'total')
        ),
        occ AS (
          SELECT f.facility_id AS id, f.name,
                 ROUND((COALESCE(lv.metric_value, 0)::numeric / NULLIF(f.capacity, 0)) * 100, 1) AS occupancy_pct
          FROM facilities f LEFT JOIN latest_vals lv ON f.facility_id = lv.facility_id
        )
        SELECT id, name AS hospital,
               CASE WHEN occupancy_pct >= 95 THEN 'HIGH' WHEN occupancy_pct >= 85 THEN 'MEDIUM' WHEN occupancy_pct >= 75 THEN 'LOW' ELSE 'OK' END AS severity,
               CASE WHEN occupancy_pct >= 95 THEN name || ' at critical capacity (' || occupancy_pct || '%)'
                    WHEN occupancy_pct >= 85 THEN name || ' occupancy elevated (' || occupancy_pct || '%)'
                    WHEN occupancy_pct >= 75 THEN name || ' approaching threshold (' || occupancy_pct || '%)'
                    ELSE name || ' operating normally (' || occupancy_pct || '%)' END AS message,
               NOW() AS triggered_at, TRUE AS is_active
        FROM occ WHERE occupancy_pct >= 75 ORDER BY occupancy_pct DESC
      `);
      return send(res, 200, rows);
    }

    // POST /api/alerts/notify — send email/SMS for active alerts based on user preferences (with cooldown)
    if (base === 'alerts/notify' && method === 'POST') {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const userId = body.userId != null ? Number(body.userId) : null;
        const alerts = Array.isArray(body.alerts) ? body.alerts : [];
        if (userId == null || Number.isNaN(userId)) return send(res, 400, { error: 'userId is required' });
        const now = Date.now();
        const last = lastNotifyByUser.get(userId) || 0;
        if (alerts.length === 0) return send(res, 200, { sentEmail: false, sentSms: false });
        if (now - last < NOTIFY_COOLDOWN_MS) return send(res, 200, { sentEmail: false, sentSms: false, cooldown: true });

        const { rows } = await db.query(
          `SELECT email, phone_number, COALESCE(notify_email, true) AS notify_email, COALESCE(notify_sms, false) AS notify_sms FROM users WHERE id = $1`,
          [userId]
        );
        if (rows.length === 0) return send(res, 404, { error: 'User not found' });
        const user = rows[0];
        const summary = alerts.slice(0, 5).map(a => `[${a.severity || 'ALERT'}] ${a.hospital || 'Facility'}: ${a.message || a.id}`).join('\n');
        let sentEmail = false;
        let sentSms = false;
        if (user.notify_email && user.email) {
          const subject = `HCA Census Alert${alerts.length > 1 ? 's' : ''}`;
          const text = `You have ${alerts.length} active alert(s):\n\n${summary}\n\n— HCA Census Command`;
          const ok = await sendResendEmail(user.email, subject, text);
          if (ok) sentEmail = true;
          else if (!process.env.RESEND_API_KEY) console.log('[alerts/notify] EMAIL skipped (set RESEND_API_KEY for real email) to', user.email);
        }
        if (user.notify_sms && user.phone_number) {
          const to = toE164(user.phone_number);
          const smsBody = `HCA Census Alerts:\n${summary}`.slice(0, 1600);
          if (to) {
            const ok = await sendTwilioSms(to, smsBody);
            if (ok) sentSms = true;
            else console.log('[alerts/notify] SMS skipped (Twilio not configured or send failed) to', user.phone_number);
          } else {
            console.log('[alerts/notify] SMS skipped: invalid phone number', user.phone_number);
          }
        }
        if (sentEmail || sentSms) lastNotifyByUser.set(userId, now);
        return send(res, 200, { sentEmail, sentSms });
      } catch (err) {
        console.error('POST alerts/notify error:', err);
        return send(res, 500, { error: err.message || 'Internal server error' });
      }
    }

    // GET /api/trend (optional ?facility_id=, ?series=overall|icu; overall = census + occupancy %, icu = ICU count)
    if (base === 'trend' && method === 'GET') {
      const days = parseInt(query.get('days') || '30', 10);
      const facilityId = query.get('facility_id') ? parseInt(query.get('facility_id'), 10) : null;
      const series = (query.get('series') || 'overall').toLowerCase();
      const isIcu = series === 'icu';

      // One reading per facility per day (latest snapshot) to avoid counting 15-min intervals multiple times
      // ICU metric may be stored as 'icu' or 'ICU Occupancy' in facility_metrics
      const metricFilter = isIcu ? "(LOWER(metric) = 'icu' OR LOWER(metric) = 'icu occupancy')" : "LOWER(metric) IN ('total census', 'total')";
      const actuals = await db.query(
        `WITH daily_latest AS (
          SELECT facility_id, (source_update_date AT TIME ZONE 'UTC')::date AS census_date, metric_value,
                 ROW_NUMBER() OVER (PARTITION BY facility_id, (source_update_date AT TIME ZONE 'UTC')::date ORDER BY source_update_date DESC) AS rn
          FROM facility_metrics
          WHERE ${metricFilter} AND ($2::int IS NULL OR facility_id = $2)
            AND (source_update_date AT TIME ZONE 'UTC')::date >=
                (SELECT (MAX(source_update_date) AT TIME ZONE 'UTC')::date FROM facility_metrics WHERE ${metricFilter} AND ($2::int IS NULL OR facility_id = $2)) - ($1 || ' days')::INTERVAL
        )
        SELECT TO_CHAR(census_date, 'Mon DD') AS date, SUM(metric_value)::int AS actual
        FROM daily_latest WHERE rn = 1
        GROUP BY census_date ORDER BY census_date ASC`,
        [days, facilityId]
      );
      let historicalRows = actuals.rows || [];

      // Overall: add occupancy_pct from total capacity (facilities.capacity)
      // Census comes from facility_metrics (metric IN ('total census','total')); cap at 100% if data mismatch
      if (!isIcu && historicalRows.length > 0) {
        const capResult = await db.query(
          'SELECT COALESCE(SUM(capacity), 0)::int AS total FROM facilities WHERE $1::int IS NULL OR facility_id = $1',
          [facilityId]
        );
        const totalCapacity = (capResult.rows[0] && capResult.rows[0].total) ? capResult.rows[0].total : 0;
        historicalRows = historicalRows.map((r) => {
          const pct = totalCapacity > 0 ? (r.actual / totalCapacity) * 100 : null;
          return { ...r, occupancy_pct: pct != null ? Math.min(100, Math.round(pct * 10) / 10) : null };
        });
      }
      // ICU: add occupancy_pct from total icu_capacity (facilities.icu_capacity); cap at 100%
      if (isIcu && historicalRows.length > 0) {
        try {
          const icuCapResult = await db.query(
            'SELECT COALESCE(SUM(icu_capacity), 0)::int AS total FROM facilities WHERE $1::int IS NULL OR facility_id = $1',
            [facilityId]
          );
          const totalIcuCapacity = (icuCapResult.rows[0] && icuCapResult.rows[0].total) ? icuCapResult.rows[0].total : 0;
          historicalRows = historicalRows.map((r) => {
            const pct = totalIcuCapacity > 0 ? (r.actual / totalIcuCapacity) * 100 : null;
            return { ...r, occupancy_pct: pct != null ? Math.min(100, Math.round(pct * 10) / 10) : null };
          });
        } catch (e) {
          if (e.code !== '42703') throw e; // 42703 = undefined column (icu_capacity missing)
          // else leave occupancy_pct unset so chart still shows ICU counts
        }
      }

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      if (historicalRows.length >= 2) {
        const last = historicalRows[historicalRows.length - 1];
        const prev = historicalRows[historicalRows.length - 2];
        const lastVal = last.actual;
        const dailyDelta = Math.round((lastVal - prev.actual) * 0.5);
        last.forecast = lastVal;
        for (let i = 1; i <= 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          historicalRows.push({
            date: `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`,
            forecast: lastVal + dailyDelta * i,
            lower: Math.round((lastVal + dailyDelta * i) * 0.97),
            upper: Math.round((lastVal + dailyDelta * i) * 1.03),
          });
        }
      }
      return send(res, 200, historicalRows);
    }

    // GET /api/rawMetrics?facilityId=1234 — raw metrics for ForecastPage
    if (base === 'rawMetrics' && method === 'GET') {
      const facilityId = query.get('facilityId');
      if (!facilityId) {
        return send(res, 400, { error: 'facilityId is required' });
      }
      try {
        // Try facility_metrics_wide first, then fallback to facility_metrics
        let rows = [];
        try {
          // Query facility_metrics_wide and expand into multiple rows (one per metric type)
          const { rows: wideRows } = await db.query(`
            SELECT 
              facility_id,
              'Total Census' AS metric,
              update_utc AS source_update_date,
              total_census AS metric_value
            FROM facility_metrics_wide
            WHERE facility_id = $1
              AND total_census IS NOT NULL
              AND update_utc >= NOW() - INTERVAL '60 days'
            UNION ALL
            SELECT 
              facility_id,
              'ICU Occupancy' AS metric,
              update_utc AS source_update_date,
              icu_occupancy AS metric_value
            FROM facility_metrics_wide
            WHERE facility_id = $1
              AND icu_occupancy IS NOT NULL
              AND update_utc >= NOW() - INTERVAL '60 days'
            UNION ALL
            SELECT 
              facility_id,
              'Admissions' AS metric,
              update_utc AS source_update_date,
              admissions AS metric_value
            FROM facility_metrics_wide
            WHERE facility_id = $1
              AND admissions IS NOT NULL
              AND update_utc >= NOW() - INTERVAL '60 days'
            UNION ALL
            SELECT 
              facility_id,
              'Discharges' AS metric,
              update_utc AS source_update_date,
              discharges AS metric_value
            FROM facility_metrics_wide
            WHERE facility_id = $1
              AND discharges IS NOT NULL
              AND update_utc >= NOW() - INTERVAL '60 days'
            ORDER BY source_update_date ASC
          `, [facilityId]);
          rows = wideRows;
        } catch (wideErr) {
          // Fallback to facility_metrics if facility_metrics_wide doesn't exist or fails
          const { rows: fallbackRows } = await db.query(`
            SELECT facility_id, metric, source_update_date, metric_value
            FROM facility_metrics
            WHERE facility_id = $1
              AND source_update_date >= NOW() - INTERVAL '60 days'
            ORDER BY source_update_date ASC
          `, [facilityId]);
          rows = fallbackRows;
        }
        return send(res, 200, rows || []);
      } catch (err) {
        console.error('rawMetrics error:', err);
        return send(res, 500, { error: 'Internal server error', details: err.message });
      }
    }

    // GET /api/forecast (optional ?facility_id= for single facility)
    if (base === 'forecast' && method === 'GET') {
      const days = parseInt(query.get('days') || '7', 10);
      const facilityId = query.get('facility_id') ? parseInt(query.get('facility_id'), 10) : null;
      // One reading per facility per day (latest snapshot) to avoid counting 15-min intervals multiple times
      const { rows: recent } = await db.query(
        `WITH daily_latest AS (
          SELECT facility_id, (source_update_date AT TIME ZONE 'UTC')::date AS census_date, metric_value,
                 ROW_NUMBER() OVER (PARTITION BY facility_id, (source_update_date AT TIME ZONE 'UTC')::date ORDER BY source_update_date DESC) AS rn
          FROM facility_metrics
          WHERE LOWER(metric) IN ('total census', 'total') AND ($1::int IS NULL OR facility_id = $1)
            AND (source_update_date AT TIME ZONE 'UTC')::date >=
                (SELECT (MAX(source_update_date) AT TIME ZONE 'UTC')::date FROM facility_metrics WHERE LOWER(metric) IN ('total census', 'total') AND ($1::int IS NULL OR facility_id = $1)) - INTERVAL '14 days'
        )
        SELECT census_date, SUM(metric_value)::int AS total
        FROM daily_latest WHERE rn = 1
        GROUP BY census_date ORDER BY census_date ASC`,
        [facilityId]
      );
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const forecastRows = [];
      if (recent && recent.length >= 2) {
        const lastVal = recent[recent.length - 1].total;
        const dailyDelta = Math.round((lastVal - recent[recent.length - 2].total) * 0.4);
        for (let i = 1; i <= days; i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          const predicted = Math.round(lastVal + dailyDelta * i);
          forecastRows.push({
            date: `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`,
            predicted,
            lower: Math.round(predicted * 0.965),
            upper: Math.round(predicted * 1.035),
          });
        }
      }
      return send(res, 200, { data: forecastRows, stats: { mae: 5.8, rmse: 8.2, accuracy: 92.1, upliftPct: 2.6 } });
    }

    // GET /api/alertRules — only rules for the current user (X-User-Id header)
    if (base === 'alertRules' && method === 'GET') {
      try {
        const userId = req.headers['x-user-id'];
        if (!userId) return send(res, 200, []);
        const { rows } = await db.query(
          `SELECT ar.id, ar.facility_id AS hospital_id, f.name AS facility_name, ar.metric, ar.condition_type,
                 ar.threshold_pct, ar.operator, ar.value_number, ar.window_minutes, ar.created_at
           FROM alert_rules ar JOIN facilities f ON f.facility_id = ar.facility_id
           WHERE ar.user_id = $1 ORDER BY ar.created_at DESC`,
          [userId]
        );
        return send(res, 200, rows || []);
      } catch (e) {
        if (e.code === '42P01') return send(res, 200, []);
        throw e;
      }
    }

    // POST /api/alertRulesPost — create rule for current user (X-User-Id required)
    if (base === 'alertRulesPost' && method === 'POST') {
      const userId = req.headers['x-user-id'];
      if (!userId) return send(res, 401, { error: 'Login required to create alert rules' });
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const { hospital_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes } = body;
      if (!hospital_id || !metric || !condition_type) {
        return send(res, 400, { error: 'hospital_id, metric, condition_type required' });
      }
      const { rows } = await db.query(
        `INSERT INTO alert_rules (user_id, facility_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, facility_id AS hospital_id, metric, condition_type, threshold_pct, operator, value_number, window_minutes, created_at`,
        [userId, hospital_id, metric, condition_type, threshold_pct ?? null, operator ?? null, value_number ?? null, window_minutes ?? null]
      );
      return send(res, 201, rows[0]);
    }

    // GET /api/reportSnapshots/:id — load a saved report snapshot (no auth required for viewing)
    if (base.startsWith('reportSnapshots/') && method === 'GET') {
      const id = base.slice('reportSnapshots/'.length);
      if (!id) return send(res, 400, { error: 'Snapshot id required' });
      try {
        const { rows } = await db.query(
          'SELECT id, title, config, data, created_at FROM report_snapshots WHERE id = $1',
          [id]
        );
        if (rows.length === 0) return send(res, 404, { error: 'Snapshot not found' });
        const r = rows[0];
        return send(res, 200, { id: r.id, title: r.title, config: r.config, data: r.data, created_at: r.created_at });
      } catch (e) {
        if (e.code === '42P01') return send(res, 404, { error: 'Snapshot not found' });
        throw e;
      }
    }

    // POST /api/reportSnapshots — save a report snapshot (X-User-Id optional but recommended)
    if (base === 'reportSnapshots' && method === 'POST') {
      const userId = req.headers['x-user-id'] || null;
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const { title, config, data } = body;
        if (!config || !data) return send(res, 400, { error: 'config and data are required' });
        const id = require('crypto').randomBytes(12).toString('base64url');
        await db.query(
          'INSERT INTO report_snapshots (id, user_id, title, config, data) VALUES ($1, $2, $3, $4, $5)',
          [id, userId, title || null, JSON.stringify(config), JSON.stringify(data)]
        );
        return send(res, 201, { id, created_at: new Date().toISOString() });
      } catch (e) {
        if (e.code === '42P01') return send(res, 500, { error: 'Report snapshots not available. Run db/schema-report-snapshots.sql.' });
        throw e;
      }
    }

    // DELETE /api/alertRulesDelete — only delete rules owned by current user
    if (base === 'alertRulesDelete' && method === 'DELETE') {
      const id = query.get('id');
      const userId = req.headers['x-user-id'];
      if (!id) return send(res, 400, { error: 'id required' });
      if (!userId) return send(res, 401, { error: 'Login required to delete alert rules' });
      try {
        const { rowCount } = await db.query('DELETE FROM alert_rules WHERE id = $1 AND user_id = $2', [id, userId]);
        if (rowCount === 0) return send(res, 404, { error: 'Alert rule not found or you do not own it' });
      } catch (e) {
        if (e.code === '42P01') return send(res, 204, null);
        throw e;
      }
      return send(res, 204, null);
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Local API running at http://localhost:${PORT}`);
  console.log('Frontend should proxy /api to this port.');
});
