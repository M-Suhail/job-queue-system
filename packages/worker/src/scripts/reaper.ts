import dotenv from 'dotenv';
dotenv.config();
import { query } from '@jobqueue/common/src/db';
import Redis from 'ioredis';
import logger from '@jobqueue/common/src/logger';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

// Default stale threshold: 5 minutes
const STALE_MINUTES = parseInt(process.env.REAPER_STALE_MINUTES || '5', 10);

async function reapOnce() {
  logger.info({ staleMinutes: STALE_MINUTES }, 'reaper started');

  // Select jobs in 'in_progress' older than threshold
  const res = await query(
    `SELECT id FROM jobs WHERE status = 'in_progress' AND updated_at < now() - ($1::interval)`,
    [`${STALE_MINUTES} minutes`]
  );

  const rows = res.rows || [];
  logger.info({ count: rows.length }, 'reaper fetched stale jobs');

  for (const row of rows) {
    const jobId = row.id;
    try {
      // bump attempts and set to failed with immediate retry
      await query(
        `UPDATE jobs
         SET status = $1, last_error = $2, attempts = (COALESCE(attempts,0) + 1), next_run_at = now(), updated_at = now()
         WHERE id = $3`,
        ['failed', 'reaper: detected stale in_progress', jobId]
      );
      // add to delayed zset for immediate processing
      await redis.zadd('delayed:jobs', Date.now(), jobId);
      logger.warn({ jobId }, 'reaped stale job and requeued');
    } catch (err:any) {
      logger.error({ err, jobId }, 'reaper failed to handle job');
    }
  }

  logger.info('reaper finished');
}

reapOnce()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'reaper crashed');
    process.exit(1);
  });
