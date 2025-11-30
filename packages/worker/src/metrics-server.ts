// packages/worker/src/metrics-server.ts
import express from 'express';
import Redis from 'ioredis';
import logger from '@jobqueue/common/src/logger';
import { register, queueLengthGauge } from '@jobqueue/common/src/metrics';

const app = express();
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

app.get('/metrics', async (_req, res) => {
  try {
    const len = await redis.llen('queue:jobs');
    queueLengthGauge.set(len);
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err:any) {
    logger.error({ err }, 'worker metrics error');
    res.status(500).end();
  }
});

const port = parseInt(process.env.WORKER_METRICS_PORT || process.env.METRICS_PORT || '9100', 10);
app.listen(port, () => logger.info({ port }, 'worker metrics listening'));
