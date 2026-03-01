import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb',
  ssl: { rejectUnauthorized: false }
});

// All tables
const { rows: tables } = await pool.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname, tablename");
console.log('=== TABLES ===');
tables.forEach(r => console.log(` ${r.schemaname}.${r.tablename}`));

// facilities
const { rows: fac } = await pool.query('SELECT id, name, capacity, region, facility_id FROM facilities ORDER BY id');
console.log(`\n=== FACILITIES (${fac.length} rows) ===`);
fac.forEach(r => console.log(` id=${r.id} fid=${r.facility_id} | ${r.name} | cap=${r.capacity} | ${r.region}`));

// facility_metrics summary
const { rows: msum } = await pool.query(`SELECT facility_id, metric, COUNT(*)::int as n, MIN(source_update_date)::text as oldest, MAX(source_update_date)::text as newest, ROUND(AVG(metric_value),1)::float as avg_val FROM facility_metrics GROUP BY facility_id, metric ORDER BY facility_id, metric`);
console.log(`\n=== FACILITY_METRICS summary ===`);
msum.forEach(r => console.log(` fid=${r.facility_id} [${r.metric}] ${r.n} rows | ${r.oldest} -> ${r.newest} | avg=${r.avg_val}`));

// forecast_data
const { rows: fc } = await pool.query('SELECT COUNT(*)::int as n, MIN(forecast_date)::text as start, MAX(forecast_date)::text as end FROM forecast_data');
console.log(`\n=== FORECAST_DATA: ${fc[0].n} rows | ${fc[0].start} -> ${fc[0].end} ===`);
const { rows: fcsample } = await pool.query('SELECT * FROM forecast_data ORDER BY forecast_date LIMIT 3');
fcsample.forEach(r => console.log(` ${JSON.stringify(r)}`));

// alerts columns
const { rows: acols } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='alerts' AND table_schema='public' ORDER BY ordinal_position");
console.log(`\n=== ALERTS columns ===`);
console.log(' ', acols.map(c => `${c.column_name}:${c.data_type}`).join(', ') || '(no columns)');
const { rows: arows } = await pool.query('SELECT * FROM alerts LIMIT 5');
if (arows.length) arows.forEach(r => console.log(' ', JSON.stringify(r)));
else console.log('  (empty)');

await pool.end();
