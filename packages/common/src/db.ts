import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://dev:dev@localhost:5432/jobs'
});

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params);
  return res;
}
