import './metrics-server';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { query } from '@jobqueue/common/src/db';
import { getHandler } from './handlers';
import logger from '@jobqueue/common/src/logger';
import { jobsProcessed, jobsFailed, jobsDeadLetter } from '@jobqueue/common/src/metrics';
import { backoffSeconds } from './utils/backoff';

dotenv.config();

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

// Separate Redis client for publishing events (cannot use same connection for pub/sub)
const redisPub = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

// Helper to publish job events
async function publishJobEvent(type: string, job: any) {
  try {
    await redisPub.publish('jobs:events', JSON.stringify({ type, job }));
  } catch (err) {
    logger.error({ err }, 'failed to publish job event');
  }
}

const READY_QUEUE = 'queue:jobs';
const DELAYED_ZSET = 'delayed:jobs';
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 1000);
const WORKER_ID = `worker-${Math.random().toString(36).slice(2, 8)}`;
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '4', 10);

let inFlight = 0;

async function moveDueJobsToReady(limit = 100) {
  const nowMs = Date.now();
  const due = await redis.zrangebyscore(DELAYED_ZSET, 0, nowMs, 'LIMIT', 0, limit);
  if (!due || due.length === 0) return;
  for (const jobId of due) {
    const removed = await redis.zrem(DELAYED_ZSET, jobId);
    if (removed) {
      await redis.rpush(READY_QUEUE, jobId);
      logger.debug({ workerId: WORKER_ID, jobId }, '[sweeper] moved job to ready');
    }
  }
}

async function sweeperLoop() {
  try {
    await moveDueJobsToReady();
  } catch (err:any) {
    logger.error({ err }, 'sweeper error');
  } finally {
    setTimeout(sweeperLoop, SWEEP_INTERVAL_MS);
  }
}

async function processJobId(jobId: string) {
  try {
    // Load job row
    const res = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
    const job = res.rows[0];
    if (!job) {
      logger.warn({ jobId }, 'job not found (maybe removed)');
      return;
    }

    // If scheduled in future, re-add to delayed set and skip
    if (job.next_run_at && new Date(job.next_run_at).getTime() > Date.now()) {
      await redis.zadd(DELAYED_ZSET, new Date(job.next_run_at).getTime(), jobId);
      logger.info({ jobId, nextRunAt: job.next_run_at }, 'job scheduled for future - moved to delayed set');
      return;
    }

    // Optimistic claim: only set in_progress if currently pending
    const claim = await query(
      `UPDATE jobs SET status='in_progress', updated_at=now() WHERE id=$1 AND status='pending' RETURNING id, attempts, max_attempts, type, payload`,
      [jobId]
    );

    if (claim.rows.length === 0) {
      // could not claim (maybe already claimed or cancelled) — skip
      logger.info({ jobId }, 'could not claim job (not pending). skipping.');
      return;
    }

    const claimedJob = claim.rows[0];
    
    // Publish in_progress event
    const inProgressJob = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
    if (inProgressJob.rows[0]) publishJobEvent('job_updated', inProgressJob.rows[0]);
    
    const handler = getHandler(claimedJob.type);

    if (!handler) {
      const errMsg = `no handler for type=${claimedJob.type}`;
      logger.error({ jobId, errMsg }, 'handler missing; moving to dead_letter');
      await query('UPDATE jobs SET status=$1, last_error=$2, updated_at=now() WHERE id=$3', ['dead_letter', errMsg, jobId]);
      jobsDeadLetter.inc();
      // Publish dead_letter event
      const updatedJob = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
      if (updatedJob.rows[0]) publishJobEvent('job_updated', updatedJob.rows[0]);
      return;
    }

    // Execute handler
    try {
      logger.info({ workerId: WORKER_ID, jobId, type: claimedJob.type }, 'processing job');
      await handler(claimedJob.payload, { jobId });

      // on success
      await query('UPDATE jobs SET status=$1, attempts=$2, updated_at=now() WHERE id=$3', ['succeeded', (claimedJob.attempts || 0) + 1, jobId]);
      jobsProcessed.inc();
      logger.info({ workerId: WORKER_ID, jobId }, 'job succeeded');
      // Publish success event
      const succeededJob = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
      if (succeededJob.rows[0]) publishJobEvent('job_updated', succeededJob.rows[0]);
    } catch (err:any) {
      const attempts = (claimedJob.attempts || 0) + 1;
      const errMsg = err?.message ?? String(err);
      jobsFailed.inc();
      logger.error({ workerId: WORKER_ID, jobId, attempt: attempts, err: errMsg }, 'job handler error');

      if (attempts >= (claimedJob.max_attempts || 5)) {
        await query('UPDATE jobs SET status=$1, attempts=$2, last_error=$3, updated_at=now() WHERE id=$4', ['dead_letter', attempts, errMsg, jobId]);
        jobsDeadLetter.inc();
        logger.warn({ workerId: WORKER_ID, jobId }, 'moved to dead_letter');
        // Publish dead_letter event
        const deadJob = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
        if (deadJob.rows[0]) publishJobEvent('job_updated', deadJob.rows[0]);
      } else {
        const delaySec = backoffSeconds(attempts);
        const nextRun = new Date(Date.now() + delaySec * 1000).toISOString();
        await query(
          'UPDATE jobs SET status=$1, attempts=$2, last_error=$3, next_run_at=$4, updated_at=now() WHERE id=$5',
          ['failed', attempts, errMsg, nextRun, jobId]
        );
        await redis.zadd(DELAYED_ZSET, Date.now() + delaySec * 1000, jobId);
        logger.info({ workerId: WORKER_ID, jobId, attempts, delaySec, nextRun }, 'requeued with backoff');
        // Publish failed event
        const failedJob = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
        if (failedJob.rows[0]) publishJobEvent('job_updated', failedJob.rows[0]);
      }
    }
  } finally {
    // decrement in-flight count in finally to ensure we always release
    inFlight = Math.max(0, inFlight - 1);
  }
}

async function workerLoop() {
  sweeperLoop();

  while (true) {
    try {
      // respect paused state
      const paused = await redis.get('queue:paused');
      if (paused) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (inFlight >= WORKER_CONCURRENCY) {
        // wait a bit if at concurrency limit
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      const id = await redis.lpop(READY_QUEUE);
      if (!id) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // increment and process concurrently (no await here)
      inFlight++;
      processJobId(id).catch((err) => {
        logger.error({ err, jobId: id }, 'processJobId uncaught error');
        // ensure inFlight decremented in finally inside processJobId
      });
    } catch (err:any) {
      logger.error({ err }, 'worker main loop error');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

workerLoop().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});
