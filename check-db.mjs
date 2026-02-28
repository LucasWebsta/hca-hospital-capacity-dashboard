import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

const { rows: tables } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
console.log('=== TABLES ===');
console.log(tables.map(r => r.tablename).join(', ') || 'NONE');

const names = tables.map(r => r.tablename);

if (names.includes('hospitals')) {
  const { rows: h } = await pool.query('SELECT id, name, capacity, region FROM hospitals ORDER BY id');
  console.log(`\n=== HOSPITALS (${h.length} rows) ===`);
  h.forEach(r => console.log(` id=${r.id} | ${r.name} | cap=${r.capacity} | ${r.region}`));
}

if (names.includes('hospital_census')) {
  const { rows: c } = await pool.query('SELECT hospital_id, COUNT(*)::int as days, MIN(census_date)::date as from, MAX(census_date)::date as to FROM hospital_census GROUP BY hospital_id ORDER BY hospital_id');
  console.log(`\n=== HOSPITAL_CENSUS coverage ===`);
  c.forEach(r => console.log(` hospital_id=${r.hospital_id}: ${r.days} rows | ${r.from} -> ${r.to}`));
}

await pool.end();
