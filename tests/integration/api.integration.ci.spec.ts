/**
 * Integration tests for CI environment
 * Uses pre-configured PostgreSQL and Redis services from GitHub Actions
 * instead of testcontainers (which are slow in CI)
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
import http from 'http';
import net from 'net';
import supertest from 'supertest';
import path from 'path';

// Helper to get a free port
function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

jest.setTimeout(60000);

let pool: Pool;
let redis: Redis;
let server: http.Server;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  // Use environment variables for connection (set by CI)
  const pgHost = process.env.PGHOST || 'localhost';
  const pgPort = parseInt(process.env.PGPORT || '5432');
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');

  // Create DB pool
  pool = new Pool({
    host: pgHost,
    port: pgPort,
    user: 'dev',
    password: 'dev',
    database: 'jobs'
  });

  // Wait for DB to be ready
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      retries--;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Create Redis client
  redis = new Redis({ host: redisHost, port: redisPort });

  // Start API server on dynamic port
  const PORT = await getPort();
  process.env.DATABASE_URL = `postgres://dev:dev@${pgHost}:${pgPort}/jobs`;
  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);
  process.env.PORT = String(PORT);

  // Clear module cache
  const serverPath = path.resolve(__dirname, '../../packages/api/dist/server.js');
  const dbPath = path.resolve(__dirname, '../../packages/common/dist/db.js');
  delete require.cache[require.resolve(serverPath)];
  delete require.cache[require.resolve(dbPath)];

  const app = require(serverPath).default;

  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, () => resolve());
    server.on('error', reject);
  });

  request = supertest(server);
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  try {
    const serverPath = path.resolve(__dirname, '../../packages/api/dist/server.js');
    const { redis: serverRedis } = require(serverPath);
    if (serverRedis) await serverRedis.quit();
  } catch (e) {}

  try {
    const dbPath = path.resolve(__dirname, '../../packages/common/dist/db.js');
    const { closePool } = require(dbPath);
    if (closePool) await closePool();
  } catch (e) {}

  if (redis) await redis.quit();
  if (pool) await pool.end();
});

// Helper to clean up Redis queue between tests
async function clearQueue() {
  await redis.del('queue:jobs');
  await redis.del('queue:priority');
  await redis.del('delayed:jobs');
  await redis.del('queue:paused');
}

describe('POST /jobs', () => {
  beforeEach(async () => {
    await clearQueue();
  });

  test('creates a job and pushes to Redis', async () => {
    const resp = await request
      .post('/jobs')
      .send({ type: 'sendEmail', payload: { to: 'inttest@example.com' } })
      .set('Accept', 'application/json')
      .expect(201);

    expect(resp.body).toHaveProperty('id');
    const jobId = resp.body.id;

    const { rows } = await pool.query('SELECT id, status FROM jobs WHERE id=$1', [jobId]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('pending');

    const queueItems = await redis.zrange('queue:priority', 0, -1);
    expect(queueItems).toContain(jobId);
  });

  test('returns 400 when type is missing', async () => {
    const resp = await request
      .post('/jobs')
      .send({ payload: { to: 'test@example.com' } })
      .set('Accept', 'application/json')
      .expect(400);

    expect(resp.body).toHaveProperty('error', 'Validation failed');
  });
});

describe('GET /jobs/:id', () => {
  test('returns job by id', async () => {
    const createResp = await request
      .post('/jobs')
      .send({ type: 'testJob', payload: { data: 'test' } })
      .expect(201);

    const jobId = createResp.body.id;

    const resp = await request
      .get(`/jobs/${jobId}`)
      .expect(200);

    expect(resp.body.id).toBe(jobId);
    expect(resp.body.type).toBe('testJob');
  });

  test('returns 404 for non-existent job', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await request.get(`/jobs/${fakeId}`).expect(404);
  });
});

describe('GET /health', () => {
  test('returns ok when services are healthy', async () => {
    const resp = await request.get('/health').expect(200);
    expect(resp.body).toEqual({ status: 'ok' });
  });
});

describe('POST /control/pause and /control/resume', () => {
  beforeEach(async () => {
    await clearQueue();
  });

  test('pause sets Redis flag', async () => {
    const resp = await request.post('/control/pause').expect(200);
    expect(resp.body).toEqual({ paused: true });

    const paused = await redis.get('queue:paused');
    expect(paused).toBe('1');
  });

  test('resume removes Redis flag', async () => {
    await redis.set('queue:paused', '1');

    const resp = await request.post('/control/resume').expect(200);
    expect(resp.body).toEqual({ paused: false });

    const paused = await redis.get('queue:paused');
    expect(paused).toBeNull();
  });
});

describe('GET /stats', () => {
  beforeEach(async () => {
    await clearQueue();
    await pool.query('DELETE FROM jobs');
  });

  test('returns queue statistics', async () => {
    await request.post('/jobs').send({ type: 'pending-1', payload: {} });
    await request.post('/jobs').send({ type: 'pending-2', payload: {} });

    const resp = await request.get('/stats').expect(200);

    expect(resp.body).toHaveProperty('pending');
    expect(resp.body).toHaveProperty('in_progress');
    expect(resp.body).toHaveProperty('succeeded');
    expect(resp.body).toHaveProperty('failed');
    expect(resp.body).toHaveProperty('dead_letter');
    expect(resp.body).toHaveProperty('queue_depth');
    expect(resp.body.pending).toBe(2);
  });
});
