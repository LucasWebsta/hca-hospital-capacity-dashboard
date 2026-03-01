/**
 * One-time migration: hash all plain-text passwords in the users table.
 * Run from repo root: node api/hash-passwords.mjs
 *
 * Safe to re-run — rows already containing a bcrypt hash ($2b$…) are skipped.
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_STpuvGNwJ8e9@ep-proud-grass-ailc7qt3-pooler.c-4.us-east-1.aws.neon.tech/neondb',
  ssl: { rejectUnauthorized: false },
});

const SALT_ROUNDS = 10;

(async () => {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash FROM users WHERE is_active = true`
  );

  let migrated = 0;
  let skipped = 0;

  for (const user of rows) {
    if (user.password_hash?.startsWith('$2')) {
      skipped++;
      continue;
    }
    const plain = user.password_hash ?? 'Demo1234!';
    const hashed = await bcrypt.hash(plain, SALT_ROUNDS);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hashed, user.id]);
    console.log(`  ✅ ${user.email}`);
    migrated++;
  }

  console.log(`\nDone — migrated: ${migrated}, already hashed: ${skipped}`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
