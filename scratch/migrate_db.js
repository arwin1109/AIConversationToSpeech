import 'dotenv/config';
import { Pool } from 'pg';

async function migrateData() {
  const prismPool = new Pool({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'prism',
  });

  const remixPool = new Pool({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'remixaudio',
  });

  try {
    // 1. Get schema of users table from prism
    const columnsRes = await prismPool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    
    const columns = columnsRes.rows;
    console.log(`Found ${columns.length} columns in prism.users`);

    // 2. Create users table in remixaudio
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        age INTEGER,
        gender VARCHAR(50),
        phone VARCHAR(50),
        gemini_api_key VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await remixPool.query(createTableQuery);
    console.log("Ensured users table exists in remixaudio.");

    // 3. Migrate data
    const prismUsers = await prismPool.query("SELECT * FROM users");
    console.log(`Migrating ${prismUsers.rows.length} users...`);

    for (const user of prismUsers.rows) {
      const keys = Object.keys(user).filter(k => k !== 'id');
      const values = keys.map(k => user[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      
      const insertQuery = `
        INSERT INTO users (${keys.join(', ')}) 
        VALUES (${placeholders})
        ON CONFLICT (email) DO UPDATE SET 
        ${keys.map(k => `${k} = EXCLUDED.${k}`).join(', ')}
      `;
      
      await remixPool.query(insertQuery, values);
    }
    console.log("Migration completed successfully.");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await prismPool.end();
    await remixPool.end();
  }
}

migrateData();
