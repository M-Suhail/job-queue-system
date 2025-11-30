import express from 'express';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { query } from '@jobqueue/common/src/db';
import { logger } from '@jobqueue/common/src/logger';
import { jobsSubmitted, register as metricsRegister, queueLengthGauge } from '@jobqueue/common/src/metrics';

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
    `INSERT INTO jobs(id, type, payload, status, attempts, max_attempts, idempotency_key, next_run_at, created_at, updated_at)
    VALUES($1,$2,$3,'pending',0,$4,$5,$6,$7,$7)`,
    [id, type, JSON.stringify(payload), maxAttempts, idempotencyKey || null, now, now]
  );

    // push job id to a simple Redis list queue
    await redis.rpush('queue:jobs', id);

    jobsSubmitted.inc(); // metric
    logger.info({ jobId: id, type }, 'job created');

    res.status(201).json({ id });
  } catch (err:any) {
    logger.error({ err }, 'insert job error');
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/jobs/:id', async (req, res) => {
  const id = req.params.id;
  const result = await query('SELECT * FROM jobs WHERE id=$1', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'not found' });
  res.json(result.rows[0]);
});

app.get('/metrics', async (_req, res) => {
  try {
    const len = await redis.llen('queue:jobs');
    queueLengthGauge.set(len);
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  } catch (err:any) {
    logger.error({ err }, 'metrics error');
    res.status(500).end();
  }
});

app.get('/health', async (_req, res) => {
  try {
    // simple DB check
    await query('SELECT 1');
    // redis ping
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error('redis not ok');
    res.json({ status: 'ok' });
  } catch (err:any) {
    logger.error({ err }, 'health check failed');
    res.status(500).json({ status: 'fail', error: err.message });
  }
});

const port = parseInt(process.env.API_PORT || '3000', 10);
app.listen(port, () => logger.info({ port }, 'API listening'));
