/**
 * List all users in the database
 */
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

// Load database URL from local.settings.json
const settings = JSON.parse(fs.readFileSync('./local.settings.json', 'utf8'));
const DATABASE_URL = settings.Values.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

async function listUsers() {
  try {
    console.log('Listing all users in database...\n');
    
    const { rows } = await pool.query(`
      SELECT id, first_name, last_name, email, role, password_hash
      FROM users
      ORDER BY id
    `);
    
    if (rows.length === 0) {
      console.log('❌ No users found in database!');
      console.log('\nPlease run users_schema.sql in your Neon database console to create users.');
    } else {
      console.log(`Found ${rows.length} user(s):\n`);
      rows.forEach(user => {
        console.log(`ID: ${user.id}`);
        console.log(`  Name: ${user.first_name} ${user.last_name}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  Role: ${user.role}`);
        console.log(`  Password: ${user.password_hash}`);
        console.log(`  Status: ${user.status || 'N/A'}`);
        console.log('');
      });
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    if (err.message.includes('does not exist')) {
      console.error('\n❌ Users table does not exist!');
      console.log('Please run users_schema.sql in your Neon database console.');
    }
  } finally {
    await pool.end();
  }
}

listUsers();

