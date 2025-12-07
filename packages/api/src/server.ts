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

  try {
    // If idempotencyKey provided, try to find an existing job (not cancelled)
    if (idempotencyKey) {
      const existing = await query(
        `SELECT id, status FROM jobs WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        // return existing id even if pending/failed/succeeded; client can query status
        logger.info({ idempotencyKey, jobId: row.id }, 'idempotent job request - returning existing job');
        jobsSubmitted.inc(); // optional: counts attempts to submit
        return res.status(200).json({ id: row.id, status: row.status });
      }
    }

    // create new job
    const id = randomUUID();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO jobs(id, type, payload, status, attempts, max_attempts, idempotency_key, next_run_at, created_at, updated_at)
       VALUES($1,$2,$3,'pending',0,$4,$5,$6,$7,$7)`,
      [id, type, JSON.stringify(payload), maxAttempts, idempotencyKey || null, now, now]
    );

    // push to ready queue
    await redis.rpush('queue:jobs', id);

    jobsSubmitted.inc();
    logger.info({ jobId: id, type, idempotencyKey }, 'job created');

    return res.status(201).json({ id });
  } catch (err:any) {
    // if unique index conflict occurs because of race (two requests with same idempotencyKey)
    if (err.code === '23505' && idempotencyKey) {
      // unique violation on idempotency_key — fetch existing job and return it
      try {
        const existing = await query(`SELECT id, status FROM jobs WHERE idempotency_key = $1 LIMIT 1`, [idempotencyKey]);
        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          logger.info({ idempotencyKey, jobId: row.id }, 'idempotency unique constraint race - returning existing job');
          return res.status(200).json({ id: row.id, status: row.status });
        }
      } catch (e:any) {
        logger.error({ err: e }, 'error fetching job after unique violation');
      }
    }

    logger.error({ err }, 'insert job error');
    return res.status(500).json({ error: 'internal' });
  }
});

app.get('/jobs/:id', async (req, res) => {
  const id = req.params.id;
  const result = await query('SELECT * FROM jobs WHERE id=$1', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'not found' });
  res.json(result.rows[0]);
});

// Cancel a job if not in_progress/succeeded/dead_letter
app.post('/jobs/:id/cancel', async (req, res) => {
  const { id } = req.params;
  try {
    const r = await query('SELECT status FROM jobs WHERE id=$1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'not found' });
    const status = r.rows[0].status;
    if (status === 'in_progress' || status === 'succeeded' || status === 'dead_letter') {
      return res.status(409).json({ error: `cannot cancel job with status ${status}` });
    }

    // Remove from Redis ready queue and delayed zset, and set cancelled in DB
    await redis.lrem('queue:jobs', 0, id); // remove from ready list
    await redis.zrem('delayed:jobs', id); // remove from delayed set

    await query('UPDATE jobs SET status=$1, updated_at=now() WHERE id=$2', ['cancelled', id]);

    logger.info({ jobId: id }, 'job cancelled');
    return res.status(200).json({ id, status: 'cancelled' });
  } catch (err:any) {
    logger.error({ err, jobId: id }, 'cancel job error');
    return res.status(500).json({ error: 'internal' });
  }
});

// Pause queue processing (sets Redis key)
app.post('/control/pause', async (_req, res) => {
  try {
    await redis.set('queue:paused', '1');
    logger.info('queue paused via API');
    res.json({ paused: true });
  } catch (err:any) {
    logger.error({ err }, 'pause failed');
    res.status(500).json({ error: 'internal' });
  }
});

// Resume processing
app.post('/control/resume', async (_req, res) => {
  try {
    await redis.del('queue:paused');
    logger.info('queue resumed via API');
    res.json({ paused: false });
  } catch (err:any) {
    logger.error({ err }, 'resume failed');
    res.status(500).json({ error: 'internal' });
  }
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

// Export redis client for graceful shutdown in tests
export { redis };
export default app;

