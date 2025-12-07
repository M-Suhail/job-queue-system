import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://dev:dev@localhost:5432/jobs'
});

// Handle pool errors to prevent unhandled rejections during shutdown
pool.on('error', (err) => {
  // Ignore connection termination errors during shutdown
  if (err.message.includes('terminating connection')) {
    return;
  }
  console.error('Unexpected database pool error:', err);
});

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params);
  return res;
}

export async function closePool() {
  await pool.end();
}
