import express from 'express';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { query } from '@jobqueue/common/src/db';

dotenv.config();

const app = express();
app.use(express.json());

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

app.post('/jobs', async (req, res) => {
  const { type, payload, idempotencyKey, maxAttempts = 5 } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });

  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    await query(
      `INSERT INTO jobs(id, type, payload, status, attempts, max_attempts, idempotency_key, created_at, updated_at)
       VALUES($1,$2,$3,'pending',0,$4,$5,$6,$6)`,
      [id, type, JSON.stringify(payload), maxAttempts, idempotencyKey || null, now]
    );

    // push job id to a simple Redis list queue
    await redis.rpush('queue:jobs', id);

    res.status(201).json({ id });
  } catch (err:any) {
    console.error('Insert job error', err);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/jobs/:id', async (req, res) => {
  const id = req.params.id;
  const result = await query('SELECT * FROM jobs WHERE id=$1', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'not found' });
  res.json(result.rows[0]);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const port = parseInt(process.env.API_PORT || '3000', 10);
app.listen(port, () => console.log(`API listening ${port}`));
