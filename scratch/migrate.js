import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB,
});

async function migrate() {
  try {
    console.log("Running migration...");
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gemini_api_key VARCHAR(255);`);
    console.log("Migration successful: gemini_api_key column added.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

migrate();
