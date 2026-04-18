import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.connect((err, _client, release) => {
  if (err) {
    console.error('Erreur connexion DB:', err.message);
  } else {
    console.log('Connecte a Neon / PostGIS');
    release();
  }
});

export default pool;