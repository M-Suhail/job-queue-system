import Redis from 'ioredis';
import dotenv from 'dotenv';
import { query } from '@jobqueue/common/src/db';
import { getHandler } from './handlers';

dotenv.config();

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

const READY_QUEUE = 'queue:jobs';
const DELAYED_ZSET = 'delayed:jobs';
const SWEEP_INTERVAL_MS = 1000;
const WORKER_ID = `worker-${Math.random().toString(36).slice(2, 8)}`;

function backoffSeconds(attempts: number) {
  const base = 5;
  const cap = 3600;
  const secs = Math.min(cap, Math.pow(2, attempts) * base);
  const jitter = secs * 0.1 * (Math.random() * 2 - 1);
  return Math.max(1, Math.round(secs + jitter));
}

async function moveDueJobsToReady(limit = 100) {
  const nowMs = Date.now();
  const due = await redis.zrangebyscore(DELAYED_ZSET, 0, nowMs, 'LIMIT', 0, limit);
  if (!due || due.length === 0) return;
  for (const jobId of due) {
    const removed = await redis.zrem(DELAYED_ZSET, jobId);
    if (removed) {
      await redis.rpush(READY_QUEUE, jobId);
      console.log(`[sweeper] moved job ${jobId} to ready`);
    }
  }
}

async function sweeperLoop() {
  try {
    await moveDueJobsToReady();
  } catch (err:any) {
    console.error('[sweeper] error', err);
  } finally {
    setTimeout(sweeperLoop, SWEEP_INTERVAL_MS);
  }
}

async function claimAndProcess(jobId: string) {
  const res = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
  const job = res.rows[0];
  if (!job) {
    console.warn('job not found', jobId);
    return;
  }

  if (job.next_run_at && new Date(job.next_run_at).getTime() > Date.now()) {
    await redis.zadd(DELAYED_ZSET, new Date(job.next_run_at).getTime(), jobId);
    return;
  }

  await query('UPDATE jobs SET status=$1, updated_at=now() WHERE id=$2', ['in_progress', jobId]);

  const handler = getHandler(job.type);
  if (!handler) {
    const errMsg = `no handler for type=${job.type}`;
    console.error(errMsg);
    await query('UPDATE jobs SET status=$1, last_error=$2, updated_at=now() WHERE id=$3', ['dead_letter', errMsg, jobId]);
    return;
  }

  try {
    console.log(`[${WORKER_ID}] processing job=${jobId} type=${job.type} attempts=${job.attempts}`);
    const payload = job.payload;
    await handler(payload, { jobId });

    await query('UPDATE jobs SET status=$1, attempts=$2, updated_at=now() WHERE id=$3', ['succeeded', (job.attempts || 0) + 1, jobId]);
    console.log(`[${WORKER_ID}] job=${jobId} succeeded`);
  } catch (err:any) {
    const attempts = (job.attempts || 0) + 1;
    const errMsg = err?.message ?? String(err);
    console.error(`[${WORKER_ID}] job=${jobId} failed attempt=${attempts} err=${errMsg}`);

    if (attempts >= (job.max_attempts || 5)) {
      await query('UPDATE jobs SET status=$1, attempts=$2, last_error=$3, updated_at=now() WHERE id=$4', ['dead_letter', attempts, errMsg, jobId]);
      console.log(`[${WORKER_ID}] job=${jobId} moved to dead_letter after ${attempts} attempts`);
    } else {
      const delaySec = backoffSeconds(attempts);
      const nextRun = new Date(Date.now() + delaySec * 1000).toISOString();
      await query(
        'UPDATE jobs SET status=$1, attempts=$2, last_error=$3, next_run_at=$4, updated_at=now() WHERE id=$5',
        ['failed', attempts, errMsg, nextRun, jobId]
      );
      await redis.zadd(DELAYED_ZSET, Date.now() + delaySec * 1000, jobId);
      console.log(`[${WORKER_ID}] job=${jobId} requeued for ${delaySec}s (next_run_at=${nextRun})`);
    }
  }
}

async function workerLoop() {
  sweeperLoop();

  while (true) {
    try {
      const id = await redis.lpop(READY_QUEUE);
      if (!id) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      await claimAndProcess(id);
    } catch (err:any) {
      console.error('worker main loop error', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

workerLoop().catch((err) => {
  console.error('worker crashed', err);
  process.exit(1);
});
