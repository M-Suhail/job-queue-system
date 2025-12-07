import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Pool } from 'pg';
import Redis from 'ioredis';
import http from 'http';
import net from 'net';
import supertest from 'supertest';
import path from 'path';

// Helper to get a free port (replaces get-port ESM package)
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

jest.setTimeout(120000);

let pgContainer: StartedTestContainer;
let redisContainer: StartedTestContainer;
let pool: Pool;
let redis: Redis;
let server: http.Server;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  // Start Postgres container
  pgContainer = await new GenericContainer('postgres:15')
    .withEnvironment({
      POSTGRES_USER: 'dev',
      POSTGRES_PASSWORD: 'dev',
      POSTGRES_DB: 'jobs'
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start();

  const pgPort = pgContainer.getMappedPort(5432);
  const pgHost = pgContainer.getHost();

  // Start Redis container
  redisContainer = await new GenericContainer('redis:7')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

  const redisPort = redisContainer.getMappedPort(6379);
  const redisHost = redisContainer.getHost();

  // Create DB pool
  pool = new Pool({
    host: pgHost,
    port: pgPort,
    user: 'dev',
    password: 'dev',
    database: 'jobs'
  });

  // Wait for DB init then run schema (create table)
  await new Promise((r) => setTimeout(r, 2000)); // small delay
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY,
      type TEXT NOT NULL,
      payload JSONB,
      status TEXT NOT NULL,
      attempts INT DEFAULT 0,
      max_attempts INT DEFAULT 5,
      idempotency_key TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      next_run_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);`);

  // Create Redis client
  redis = new Redis({ host: redisHost, port: redisPort });

  // Start API server on dynamic port, injecting env for tests
  const PORT = await getPort();
  process.env.DATABASE_URL = `postgres://dev:dev@${pgHost}:${pgPort}/jobs`;
  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = String(redisPort);
  process.env.PORT = String(PORT);

  // Clear module cache to ensure fresh imports with new env vars
  const serverPath = path.resolve(__dirname, '../../packages/api/dist/server.js');
  const dbPath = path.resolve(__dirname, '../../packages/common/dist/db.js');
  delete require.cache[require.resolve(serverPath)];
  delete require.cache[require.resolve(dbPath)];

  // Import the app (requires build step: npm run build)
  const app = require(serverPath).default;

  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, () => resolve());
    server.on('error', (err) => reject(err));
  });

  request = supertest(server);
});

afterAll(async () => {
  // Close resources gracefully in the correct order
  // 1. First close the HTTP server
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  // 2. Close the API server's internal Redis connection
  try {
    const serverPath = path.resolve(__dirname, '../../packages/api/dist/server.js');
    const { redis: serverRedis } = require(serverPath);
    if (serverRedis) await serverRedis.quit();
  } catch (e) {
    // ignore if not available
  }

  // 3. Close the shared database pool from common module
  try {
    const dbPath = path.resolve(__dirname, '../../packages/common/dist/db.js');
    const { closePool } = require(dbPath);
    if (closePool) await closePool();
  } catch (e) {
    // ignore if not available
  }

  // 4. Close test Redis client
  if (redis) {
    await redis.quit();
  }

  // 5. Close test pool
  if (pool) {
    await pool.end();
  }

  // 6. Allow connections to fully drain before stopping containers
  await new Promise((r) => setTimeout(r, 500));

  // 7. Stop containers last
  if (pgContainer) {
    await pgContainer.stop();
  }

  if (redisContainer) {
    await redisContainer.stop();
  }
});

// Helper to clean up Redis queue between tests
async function clearQueue() {
  await redis.del('queue:jobs');
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

    // check DB row
    const { rows } = await pool.query('SELECT id, status FROM jobs WHERE id=$1', [jobId]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('pending');

    // check Redis list has id
    const lpop = await redis.lpop('queue:jobs');
    expect(lpop).toBe(jobId);
  });

  test('returns 400 when type is missing', async () => {
    const resp = await request
      .post('/jobs')
      .send({ payload: { to: 'test@example.com' } })
      .set('Accept', 'application/json')
      .expect(400);

    expect(resp.body).toHaveProperty('error', 'type required');
  });

  test('idempotency key returns existing job on duplicate', async () => {
    const idempotencyKey = `test-idem-${Date.now()}`;

    // First request - creates job
    const resp1 = await request
      .post('/jobs')
      .send({ type: 'sendEmail', payload: { to: 'idem@example.com' }, idempotencyKey })
      .set('Accept', 'application/json')
      .expect(201);

    const jobId = resp1.body.id;

    // Second request with same idempotency key - returns existing
    const resp2 = await request
      .post('/jobs')
      .send({ type: 'sendEmail', payload: { to: 'different@example.com' }, idempotencyKey })
      .set('Accept', 'application/json')
      .expect(200);

    expect(resp2.body.id).toBe(jobId);
    expect(resp2.body).toHaveProperty('status');
  });
});

describe('GET /jobs/:id', () => {
  test('returns job by id', async () => {
    // Create a job first
    const createResp = await request
      .post('/jobs')
      .send({ type: 'testJob', payload: { data: 'test' } })
      .expect(201);

    const jobId = createResp.body.id;

    // Fetch the job
    const resp = await request
      .get(`/jobs/${jobId}`)
      .expect(200);

    expect(resp.body.id).toBe(jobId);
    expect(resp.body.type).toBe('testJob');
    expect(resp.body.status).toBe('pending');
  });

  test('returns 404 for non-existent job', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const resp = await request
      .get(`/jobs/${fakeId}`)
      .expect(404);

    expect(resp.body).toHaveProperty('error', 'not found');
  });
});

describe('POST /jobs/:id/cancel', () => {
  beforeEach(async () => {
    await clearQueue();
  });

  test('cancels a pending job', async () => {
    // Create a job
    const createResp = await request
      .post('/jobs')
      .send({ type: 'cancelTest', payload: {} })
      .expect(201);

    const jobId = createResp.body.id;

    // Cancel the job
    const cancelResp = await request
      .post(`/jobs/${jobId}/cancel`)
      .expect(200);

    expect(cancelResp.body.status).toBe('cancelled');

    // Verify in DB
    const { rows } = await pool.query('SELECT status FROM jobs WHERE id=$1', [jobId]);
    expect(rows[0].status).toBe('cancelled');

    // Verify removed from Redis queue
    const queueItems = await redis.lrange('queue:jobs', 0, -1);
    expect(queueItems).not.toContain(jobId);
  });

  test('returns 404 for non-existent job', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const resp = await request
      .post(`/jobs/${fakeId}/cancel`)
      .expect(404);

    expect(resp.body).toHaveProperty('error', 'not found');
  });

  test('returns 409 when trying to cancel succeeded job', async () => {
    // Create and manually set job to succeeded
    const createResp = await request
      .post('/jobs')
      .send({ type: 'completedJob', payload: {} })
      .expect(201);

    const jobId = createResp.body.id;

    // Manually update to succeeded status
    await pool.query('UPDATE jobs SET status=$1 WHERE id=$2', ['succeeded', jobId]);

    // Try to cancel
    const cancelResp = await request
      .post(`/jobs/${jobId}/cancel`)
      .expect(409);

    expect(cancelResp.body.error).toContain('cannot cancel');
  });
});

describe('POST /control/pause and /control/resume', () => {
  beforeEach(async () => {
    await clearQueue();
  });

  test('pause sets Redis flag', async () => {
    const resp = await request
      .post('/control/pause')
      .expect(200);

    expect(resp.body).toEqual({ paused: true });

    // Verify Redis flag
    const paused = await redis.get('queue:paused');
    expect(paused).toBe('1');
  });

  test('resume removes Redis flag', async () => {
    // First pause
    await redis.set('queue:paused', '1');

    const resp = await request
      .post('/control/resume')
      .expect(200);

    expect(resp.body).toEqual({ paused: false });

    // Verify Redis flag removed
    const paused = await redis.get('queue:paused');
    expect(paused).toBeNull();
  });
});

describe('GET /health', () => {
  test('returns ok when services are healthy', async () => {
    const resp = await request
      .get('/health')
      .expect(200);

    expect(resp.body).toEqual({ status: 'ok' });
  });
});

describe('GET /metrics', () => {
  test('returns Prometheus metrics', async () => {
    const resp = await request
      .get('/metrics')
      .expect(200);

    expect(resp.headers['content-type']).toMatch(/text\/plain/);
    expect(resp.text).toContain('jobs_submitted');
  });
});
