import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB,
});

async function testUpdate() {
  try {
    // Get the first user id
    const users = await pool.query("SELECT id, username FROM users LIMIT 1");
    if (users.rows.length === 0) {
      console.log("No users found to test.");
      return;
    }
    const userId = users.rows[0].id;
    const username = users.rows[0].username;
    console.log(`Testing update for user: ${username} (ID: ${userId})`);

    const result = await pool.query("UPDATE users SET gemini_api_key = $1 WHERE id = $2", ["test_key_" + Date.now(), userId]);
    console.log(`Update result: ${result.rowCount} rows updated`);
    
    const verify = await pool.query("SELECT gemini_api_key FROM users WHERE id = $1", [userId]);
    console.log(`Verified key in DB: ${verify.rows[0].gemini_api_key}`);
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await pool.end();
  }
}

testUpdate();
