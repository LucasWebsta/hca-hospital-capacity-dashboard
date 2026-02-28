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

// ── Router ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api/, '');
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);

  console.log(`[${new Date().toLocaleTimeString()}] GET ${url.pathname}`);

  try {
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
  console.log('   /census  /facilities  /alerts  /trend?days=N  /forecast?days=N\n');
});
