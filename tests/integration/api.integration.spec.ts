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

test('POST /jobs creates a job and pushes to Redis', async () => {
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
