import Redis from 'ioredis';
import dotenv from 'dotenv';
import { query } from '@jobqueue/common/src/db';

dotenv.config();

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

async function processJob(jobId: string) {
  const res = await query('SELECT * FROM jobs WHERE id=$1', [jobId]);
  const job = res.rows[0];
  if (!job) {
    console.warn('job not found', jobId);
    return;
  }

  try {
    console.log(`Processing job ${jobId} type=${job.type}`);

    // Simulated work. Replace this with actual handler logic per job.type
    await new Promise((r) => setTimeout(r, 500));

    await query('UPDATE jobs SET status=$1, attempts=$2, updated_at=now() WHERE id=$3',
      ['succeeded', job.attempts + 1, jobId]);
    console.log(`Job ${jobId} succeeded`);
  } catch (err:any) {
    console.error('Job failed', jobId, err);
    const attempts = job.attempts + 1;
    const status = attempts >= job.max_attempts ? 'dead_letter' : 'failed';
    await query('UPDATE jobs SET status=$1, attempts=$2, last_error=$3, updated_at=now() WHERE id=$4',
      [status, attempts, err.message, jobId]);

    // If not dead_letter, re-enqueue for retry simple approach
    if (status !== 'dead_letter') {
      // simple immediate requeue. In next phases replace with backoff scheduling
      await redis.rpush('queue:jobs', jobId);
    }
  }
}

async function loop() {
  while (true) {
    const id = await redis.lpop('queue:jobs');
    if (!id) {
      await new Promise(r => setTimeout(r, 300));
      continue;
    }
    await processJob(id);
  }
}

loop().catch(err => {
  console.error('worker crashed', err);
  process.exit(1);
});