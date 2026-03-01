/**
 * Test script to check activity_logs table
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

async function testActivityLogs() {
  try {
    console.log('Testing activity_logs table...\n');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'activity_logs'
      );
    `);
    
    console.log('Table exists:', tableCheck.rows[0].exists);
    
    if (!tableCheck.rows[0].exists) {
      console.log('\n❌ activity_logs table does not exist!');
      console.log('Please run users_schema.sql in your Neon database console.');
      process.exit(1);
    }
    
    // Check table structure
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'activity_logs'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nTable structure:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    
    // Count existing logs
    const count = await pool.query('SELECT COUNT(*) FROM activity_logs');
    console.log(`\nTotal logs in table: ${count.rows[0].count}`);
    
    // Get recent logs
    const recentLogs = await pool.query(`
      SELECT id, user_id, user_name, action, timestamp
      FROM activity_logs
      ORDER BY timestamp DESC
      LIMIT 10
    `);
    
    console.log(`\nRecent logs (${recentLogs.rows.length}):`);
    recentLogs.rows.forEach(log => {
      console.log(`  - ${log.user_name} ${log.action} at ${log.timestamp}`);
    });
    
    // Test insert
    console.log('\nTesting insert...');
    const insertResult = await pool.query(`
      INSERT INTO activity_logs (user_name, action)
      VALUES ($1, 'signin')
      RETURNING id, user_name, action, timestamp
    `, ['Test User']);
    
    console.log('✅ Insert successful:', insertResult.rows[0]);
    
    // Clean up test insert
    await pool.query('DELETE FROM activity_logs WHERE user_name = $1', ['Test User']);
    console.log('✅ Test insert cleaned up');
    
    console.log('\n✅ All tests passed!');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testActivityLogs();



