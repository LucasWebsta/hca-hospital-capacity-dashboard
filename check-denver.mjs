import pg from '/Users/robertgill/hcademo/node_modules/pg/lib/index.js';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb',
  ssl: { rejectUnauthorized: false }
});
const { rows: fac } = await pool.query("SELECT facility_id, name, capacity FROM facilities WHERE facility_id=12345");
console.log('FACILITY:', JSON.stringify(fac[0]));

const { rows: latest } = await pool.query(`
  SELECT update_utc, total_census, icu_occupancy, admissions, discharges, births
  FROM facility_metrics_wide WHERE facility_id=12345
  ORDER BY update_utc DESC LIMIT 3
`);
console.log('LATEST METRICS:', JSON.stringify(latest, null, 2));

const { rows: fc } = await pool.query(`
  SELECT forecast_date, predicted_census, lower_bound, upper_bound
  FROM forecast_data WHERE facility_id=12345
  ORDER BY forecast_date LIMIT 7
`);
console.log('FORECAST:', JSON.stringify(fc, null, 2));

await pool.end();
