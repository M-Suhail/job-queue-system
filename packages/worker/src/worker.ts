import './metrics-server';
import os from 'os';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { query, closePool } from '@jobqueue/common/src/db';
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

const PRIORITY_QUEUE = 'queue:priority';  // Sorted set for priority queue
const READY_QUEUE = 'queue:jobs';  // Fallback for legacy jobs
const DELAYED_ZSET = 'delayed:jobs';
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 1000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 5000);
const WORKER_ID = `worker-${os.hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '4', 10);
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);
const DEFAULT_JOB_TIMEOUT_MS = parseInt(process.env.DEFAULT_JOB_TIMEOUT_MS || '300000', 10); // 5 min default

let inFlight = 0;
let shuttingDown = false;
let jobsProcessedCount = 0;
let jobsFailedCount = 0;
let currentJobId: string | null = null;

// Worker registration and heartbeat
async function registerWorker() {
  try {
    await query(
      `INSERT INTO workers (id, hostname, pid, concurrency, status, last_heartbeat, started_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', now(), now(), now())
       ON CONFLICT (id) DO UPDATE SET 
         status = 'active',
         last_heartbeat = now(),
         updated_at = now()`,
      [WORKER_ID, os.hostname(), process.pid, WORKER_CONCURRENCY]
    );
    logger.info({ workerId: WORKER_ID, concurrency: WORKER_CONCURRENCY }, 'worker registered');
  } catch (err) {
    logger.error({ err }, 'failed to register worker');
  }
}

async function sendHeartbeat() {
  if (shuttingDown) return;
  
  try {
    const status = inFlight > 0 ? 'active' : 'idle';
    await query(
      `UPDATE workers SET 
         status = $1,
         jobs_processed = $2,
         jobs_failed = $3,
         current_job_id = $4,
         last_heartbeat = now(),
         updated_at = now()
       WHERE id = $5`,
      [status, jobsProcessedCount, jobsFailedCount, currentJobId, WORKER_ID]
    );
  } catch (err) {
    logger.error({ err }, 'failed to send heartbeat');
  }
}

async function unregisterWorker() {
  try {
    await query(
      `UPDATE workers SET status = 'offline', current_job_id = NULL, updated_at = now() WHERE id = $1`,
      [WORKER_ID]
    );
    logger.info({ workerId: WORKER_ID }, 'worker unregistered');
  } catch (err) {
    logger.error({ err }, 'failed to unregister worker');
  }
}

// Start heartbeat loop
function startHeartbeat() {
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

async function moveDueJobsToReady(limit = 100) {
  const nowMs = Date.now();
  const due = await redis.zrangebyscore(DELAYED_ZSET, 0, nowMs, 'LIMIT', 0, limit);
  if (!due || due.length === 0) return;
  for (const jobId of due) {
    const removed = await redis.zrem(DELAYED_ZSET, jobId);
    if (removed) {
      // Get job priority and add to priority queue
      const jobRes = await query('SELECT priority FROM jobs WHERE id=$1', [jobId]);
      const priority = jobRes.rows[0]?.priority || 5;
      const score = -priority * 1e12 + Date.now();
      await redis.zadd(PRIORITY_QUEUE, score, jobId);
      logger.debug({ workerId: WORKER_ID, jobId, priority }, '[sweeper] moved job to priority queue');
    }
  }
}

async function sweeperLoop() {
  try {
    await moveDueJobsToReady();
  } catch (err:any) {
    logger.error({ err }, 'sweeper error');
  } finally {
    if (!shuttingDown) {
      setTimeout(sweeperLoop, SWEEP_INTERVAL_MS);
    }
  }
}

// Helper to run handler with timeout
async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  jobId: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Job timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (err) {
    clearTimeout(timeoutHandle!);
    throw err;
  }
}

async function processJobId(jobId: string) {
  currentJobId = jobId;
  
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
      `UPDATE jobs SET status='in_progress', updated_at=now() WHERE id=$1 AND status='pending' RETURNING id, attempts, max_attempts, type, payload, timeout_ms, priority`,
      [jobId]
    );

    if (claim.rows.length === 0) {
      // could not claim (maybe already claimed or cancelled) — skip
      logger.info({ jobId }, 'could not claim job (not pending). skipping.');
      return;
    }

    const claimedJob = claim.rows[0];
    const jobTimeout = claimedJob.timeout_ms || DEFAULT_JOB_TIMEOUT_MS;
    
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

    // Execute handler with timeout
    try {
      logger.info({ workerId: WORKER_ID, jobId, type: claimedJob.type, timeout: jobTimeout, priority: claimedJob.priority }, 'processing job');
      
      // Run handler with timeout
      await runWithTimeout(
        handler(claimedJob.payload, { jobId }),
        jobTimeout,
        jobId
      );

      // on success
      await query('UPDATE jobs SET status=$1, attempts=$2, updated_at=now() WHERE id=$3', ['succeeded', (claimedJob.attempts || 0) + 1, jobId]);
      jobsProcessed.inc();
      jobsProcessedCount++;
      logger.info({ workerId: WORKER_ID, jobId }, 'job succeeded');
      // Publish success event
      const succeededJob = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
      if (succeededJob.rows[0]) publishJobEvent('job_updated', succeededJob.rows[0]);
    } catch (err:any) {
      const attempts = (claimedJob.attempts || 0) + 1;
      const errMsg = err?.message ?? String(err);
      const isTimeout = errMsg.includes('timed out');
      jobsFailed.inc();
      jobsFailedCount++;
      logger.error({ workerId: WORKER_ID, jobId, attempt: attempts, err: errMsg, isTimeout }, 'job handler error');

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
    currentJobId = null;
  }
}

// Fetch next job from priority queue (highest priority first, FIFO within same priority)
async function fetchNextJob(): Promise<string | null> {
  // First try priority queue (sorted set)
  const priorityJobs = await redis.zrange(PRIORITY_QUEUE, 0, 0);
  if (priorityJobs.length > 0) {
    const jobId = priorityJobs[0];
    const removed = await redis.zrem(PRIORITY_QUEUE, jobId);
    if (removed) {
      return jobId;
    }
  }
  
  // Fallback to legacy ready queue (list) for backwards compatibility
  const legacyJob = await redis.lpop(READY_QUEUE);
  return legacyJob;
}

async function workerLoop() {
  // Register worker and start heartbeat
  await registerWorker();
  startHeartbeat();
  
  sweeperLoop();

  while (!shuttingDown) {
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

      const id = await fetchNextJob();
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
  
  logger.info({ workerId: WORKER_ID }, 'Worker loop exited');
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  
  logger.info({ signal, workerId: WORKER_ID, inFlight }, 'Received shutdown signal, waiting for in-flight jobs...');
  
  // Mark worker as draining
  await query(`UPDATE workers SET status = 'draining', updated_at = now() WHERE id = $1`, [WORKER_ID]);
  
  // Wait for in-flight jobs to complete (with timeout)
  const startTime = Date.now();
  while (inFlight > 0 && Date.now() - startTime < SHUTDOWN_TIMEOUT_MS) {
    logger.info({ inFlight }, 'Waiting for in-flight jobs to complete...');
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (inFlight > 0) {
    logger.warn({ inFlight }, 'Shutdown timeout exceeded, some jobs may not have completed');
  }
  
  try {
    // Unregister worker
    await unregisterWorker();
    
    // Close Redis connections
    await redis.quit();
    await redisPub.quit();
    logger.info('Redis connections closed');
    
    // Close database pool
    await closePool();
    logger.info('Database pool closed');
    
    logger.info({ workerId: WORKER_ID }, 'Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

workerLoop().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});
