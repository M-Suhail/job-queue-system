import express from 'express';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { query } from '@jobqueue/common/src/db';
import { logger } from '@jobqueue/common/src/logger';
import { jobsSubmitted, register as metricsRegister, queueLengthGauge } from '@jobqueue/common/src/metrics';
import { emitJobCreated, emitJobUpdated } from './socket';

dotenv.config();

// Swagger configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Job Queue API',
      version: '1.0.0',
      description: 'A distributed job queue system with real-time updates via Socket.IO',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for protected endpoints (pause/resume/delete)',
        },
      },
      schemas: {
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Unique job identifier' },
            type: { type: 'string', description: 'Job type (e.g., sendEmail, processImage)' },
            payload: { type: 'object', description: 'Job-specific data' },
            status: { 
              type: 'string', 
              enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled', 'dead_letter'],
              description: 'Current job status'
            },
            attempts: { type: 'integer', description: 'Number of execution attempts' },
            max_attempts: { type: 'integer', description: 'Maximum allowed attempts before dead_letter' },
            priority: { type: 'integer', minimum: 1, maximum: 10, description: 'Job priority (1=lowest, 10=highest)' },
            timeout_ms: { type: 'integer', nullable: true, description: 'Job timeout in milliseconds' },
            last_error: { type: 'string', nullable: true, description: 'Last error message if failed' },
            idempotency_key: { type: 'string', format: 'uuid', nullable: true, description: 'Optional idempotency key' },
            next_run_at: { type: 'string', format: 'date-time', description: 'Scheduled next run time' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateJobRequest: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', minLength: 1, maxLength: 100, description: 'Job type' },
            payload: { type: 'object', default: {}, description: 'Job payload data' },
            idempotencyKey: { type: 'string', format: 'uuid', description: 'Optional idempotency key' },
            maxAttempts: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
            priority: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'Job priority (1=lowest, 10=highest)' },
            timeout: { type: 'integer', minimum: 1000, maximum: 3600000, description: 'Job timeout in ms (1s-1h)' },
          },
        },
        Worker: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Worker ID' },
            hostname: { type: 'string', description: 'Host machine name' },
            pid: { type: 'integer', description: 'Process ID' },
            concurrency: { type: 'integer', description: 'Max concurrent jobs' },
            status: { type: 'string', enum: ['active', 'idle', 'draining', 'offline'] },
            jobs_processed: { type: 'integer' },
            jobs_failed: { type: 'integer' },
            current_job_id: { type: 'string', format: 'uuid', nullable: true },
            last_heartbeat: { type: 'string', format: 'date-time' },
            started_at: { type: 'string', format: 'date-time' },
          },
        },
        Stats: {
          type: 'object',
          properties: {
            queueDepth: { type: 'integer', description: 'Jobs waiting in ready queue' },
            inProgress: { type: 'integer' },
            succeeded: { type: 'integer' },
            failed: { type: 'integer' },
            deadLetter: { type: 'integer' },
            pending: { type: 'integer' },
            paused: { type: 'boolean' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./src/server.ts'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar] && process.env.NODE_ENV === 'production') {
    logger.error({ envVar }, 'Missing required environment variable');
    process.exit(1);
  }
}

const app = express();

// Security middleware - allow swagger-ui to load inline scripts/styles
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(express.json({ limit: '1mb' })); // Limit payload size

// Swagger UI - must be before rate limiting
// @ts-ignore - swagger-ui-express types conflict with express types
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'Job Queue API Docs',
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// Rate limiting - more strict for control endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/metrics',
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter as unknown as express.RequestHandler);

// Optional API key authentication for sensitive endpoints
const apiKeyAuth: express.RequestHandler = (req, res, next) => {
  const apiKey = process.env.API_KEY;
  // Skip auth if no API_KEY is configured (development mode)
  if (!apiKey) return next();
  
  const providedKey = req.headers['x-api-key'] || req.query.api_key;
  if (providedKey !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// Zod schemas for input validation
const createJobSchema = z.object({
  type: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  idempotencyKey: z.string().uuid().optional(),
  maxAttempts: z.number().int().min(1).max(100).default(5),
  priority: z.number().int().min(1).max(10).default(5),  // 1 (lowest) to 10 (highest)
  timeout: z.number().int().min(1000).max(3600000).optional(),  // 1s to 1h in ms
});

const jobFiltersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'dead_letter']).optional(),
  type: z.string().max(100).optional(),
  cursor: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  minAttempts: z.coerce.number().int().min(0).optional(),
  maxAttempts: z.coerce.number().int().min(0).optional(),
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

// Redis publisher for events (workers subscribe to this)
const redisPub = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new job
 *     description: Submit a new job to the queue. Supports idempotency via optional idempotencyKey.
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateJobRequest'
 *           example:
 *             type: sendEmail
 *             payload: { to: "user@example.com", subject: "Hello" }
 *             maxAttempts: 5
 *     responses:
 *       201:
 *         description: Job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *       200:
 *         description: Existing job returned (idempotent request)
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
app.post('/jobs', async (req, res) => {
  // Validate input with Zod
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { type, payload, idempotencyKey, maxAttempts, priority, timeout } = parsed.data;

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
      `INSERT INTO jobs(id, type, payload, status, attempts, max_attempts, priority, timeout_ms, idempotency_key, next_run_at, created_at, updated_at)
       VALUES($1,$2,$3,'pending',0,$4,$5,$6,$7,$8,$9,$9)`,
      [id, type, JSON.stringify(payload), maxAttempts, priority, timeout || null, idempotencyKey || null, now, now]
    );

    // Push to priority queue (sorted set with score = -priority * 1e12 + timestamp for FIFO within same priority)
    const score = -priority * 1e12 + Date.now();
    await redis.zadd('queue:priority', score, id);

    jobsSubmitted.inc();
    logger.info({ jobId: id, type, priority, timeout, idempotencyKey }, 'job created');

    // Fetch full job and emit event
    const jobResult = await query('SELECT * FROM jobs WHERE id=$1', [id]);
    if (jobResult.rows.length > 0) {
      emitJobCreated(jobResult.rows[0]);
    }

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

// UUID validation helper
const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get job by ID
 *     description: Retrieve detailed information about a specific job
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Job'
 *       400:
 *         description: Invalid job ID format
 *       404:
 *         description: Job not found
 */
app.get('/jobs/:id', async (req, res) => {
  const id = req.params.id;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'invalid job id format' });
  
  try {
    const result = await query('SELECT * FROM jobs WHERE id=$1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    logger.error({ err, id }, 'get job error');
    res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /jobs:
 *   get:
 *     summary: List jobs
 *     description: Retrieve a paginated list of jobs with optional filters
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 20
 *         description: Number of jobs to return
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, succeeded, failed, cancelled, dead_letter]
 *         description: Filter by job status
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search in job ID, type, or payload
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination (format timestamp_id)
 *       - in: query
 *         name: created_after
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter jobs created after this time
 *       - in: query
 *         name: created_before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter jobs created before this time
 *       - in: query
 *         name: min_attempts
 *         schema:
 *           type: integer
 *         description: Minimum number of attempts
 *       - in: query
 *         name: max_attempts
 *         schema:
 *           type: integer
 *         description: Maximum number of attempts
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Job'
 *                 total:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: Invalid query parameters
 */
// List jobs with optional limit, offset and filters
app.get('/jobs', async (req, res) => {
  try {
    // Validate query parameters with Zod
    const parsed = jobFiltersSchema.safeParse({
      limit: req.query.limit,
      status: req.query.status,
      cursor: req.query.cursor,
      createdAfter: req.query.created_after,
      createdBefore: req.query.created_before,
      minAttempts: req.query.min_attempts,
      maxAttempts: req.query.max_attempts,
    });
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }
    
    const { limit, status, cursor, createdAfter, createdBefore, minAttempts, maxAttempts: maxAttemptsFilter } = parsed.data;
    const search = req.query.q as string | undefined;
    
    let whereSql = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    // Cursor-based pagination: timestamp + id for stable ordering
    if (cursor) {
      try {
        const [cursorTime, cursorId] = cursor.split('_');
        whereSql += ` AND (created_at, id) < ($${paramIndex++}::timestamptz, $${paramIndex++}::uuid)`;
        params.push(cursorTime, cursorId);
      } catch (e) {
        // Invalid cursor format, ignore
        logger.warn({ cursor }, 'Invalid cursor format');
      }
    }
    
    if (status) {
      whereSql += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    
    // Enhanced search: search in type, id, and payload (JSONB)
    if (search) {
      whereSql += ` AND (id::text ILIKE $${paramIndex} OR type ILIKE $${paramIndex} OR payload::text ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Date range filtering
    if (createdAfter) {
      whereSql += ` AND created_at >= $${paramIndex++}::timestamptz`;
      params.push(createdAfter);
    }
    
    if (createdBefore) {
      whereSql += ` AND created_at <= $${paramIndex++}::timestamptz`;
      params.push(createdBefore);
    }
    
    // Attempts filtering
    if (minAttempts !== undefined) {
      whereSql += ` AND attempts >= $${paramIndex++}`;
      params.push(minAttempts);
    }
    
    if (maxAttemptsFilter !== undefined) {
      whereSql += ` AND attempts <= $${paramIndex++}`;
      params.push(maxAttemptsFilter);
    }
    
    // Get total count (only if no cursor - expensive for deep pagination)
    let total = 0;
    if (!cursor) {
      const countResult = await query(`SELECT COUNT(*) as total FROM jobs ${whereSql}`, params);
      total = parseInt(countResult.rows[0].total);
    }
    
    // Get paginated results with one extra to determine if there's more
    const dataSql = `SELECT * FROM jobs ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);
    
    const result = await query(dataSql, params);
    
    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const data = hasMore ? result.rows.slice(0, limit) : result.rows;
    
    // Generate next cursor from last item
    let nextCursor = null;
    if (hasMore && data.length > 0) {
      const lastJob = data[data.length - 1];
      nextCursor = `${lastJob.created_at.toISOString()}_${lastJob.id}`;
    }
    
    res.json({
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor,
        ...(cursor ? {} : { total }) // Only include total on first page
      }
    });
  } catch (err: any) {
    logger.error({ err }, 'list jobs error');
    res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /jobs/{id}/cancel:
 *   post:
 *     summary: Cancel a job
 *     description: Cancel a pending or failed job. Cannot cancel jobs that are in_progress, succeeded, or dead_letter.
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Job cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: cancelled
 *       404:
 *         description: Job not found
 *       409:
 *         description: Job cannot be cancelled in current state
 */
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

    // Remove from Redis ready queue, priority queue, and delayed zset, and set cancelled in DB
    await redis.lrem('queue:jobs', 0, id); // remove from ready list
    await redis.zrem('queue:priority', id); // remove from priority queue
    await redis.zrem('delayed:jobs', id); // remove from delayed set

    await query('UPDATE jobs SET status=$1, updated_at=now() WHERE id=$2', ['cancelled', id]);

    logger.info({ jobId: id }, 'job cancelled');
    
    // Emit job_updated event
    const jobResult = await query('SELECT * FROM jobs WHERE id=$1', [id]);
    if (jobResult.rows.length > 0) {
      emitJobUpdated(jobResult.rows[0]);
    }
    
    return res.status(200).json({ id, status: 'cancelled' });
  } catch (err:any) {
    logger.error({ err, jobId: id }, 'cancel job error');
    return res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /jobs/{id}/retry:
 *   post:
 *     summary: Retry a failed job
 *     description: Reset a dead_letter, failed, or cancelled job back to pending state
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Job reset to pending
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: pending
 *       400:
 *         description: Invalid job ID format
 *       404:
 *         description: Job not found
 *       409:
 *         description: Job cannot be retried in current state
 */
// Retry a dead_letter or failed job - resets it to pending
app.post('/jobs/:id/retry', async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'invalid job id format' });
  
  try {
    const r = await query('SELECT * FROM jobs WHERE id=$1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'not found' });
    
    const job = r.rows[0];
    if (job.status !== 'dead_letter' && job.status !== 'failed' && job.status !== 'cancelled') {
      return res.status(409).json({ error: `cannot retry job with status ${job.status}` });
    }

    // Reset job to pending state
    await query(
      'UPDATE jobs SET status=$1, attempts=0, last_error=NULL, next_run_at=now(), updated_at=now() WHERE id=$2',
      ['pending', id]
    );
    
    // Push to Redis ready queue
    await redis.rpush('queue:jobs', id);

    logger.info({ jobId: id, previousStatus: job.status }, 'job retried');
    
    // Emit job_updated event
    const updatedJob = await query('SELECT * FROM jobs WHERE id=$1', [id]);
    if (updatedJob.rows.length > 0) {
      emitJobUpdated(updatedJob.rows[0]);
    }
    
    return res.status(200).json({ id, status: 'pending' });
  } catch (err:any) {
    logger.error({ err, jobId: id }, 'retry job error');
    return res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /jobs/{id}:
 *   delete:
 *     summary: Delete a job
 *     description: Permanently delete a job. Cannot delete jobs that are in_progress. Requires API key.
 *     tags: [Jobs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Job deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 deleted:
 *                   type: boolean
 *       400:
 *         description: Invalid job ID format
 *       401:
 *         description: Unauthorized - API key required
 *       404:
 *         description: Job not found
 *       409:
 *         description: Cannot delete job in_progress
 */
// Delete a job permanently
app.delete('/jobs/:id', apiKeyAuth, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ error: 'invalid job id format' });
  
  try {
    const r = await query('SELECT status FROM jobs WHERE id=$1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'not found' });
    
    const status = r.rows[0].status;
    if (status === 'in_progress') {
      return res.status(409).json({ error: 'cannot delete job that is in_progress' });
    }

    // Remove from Redis queues
    await redis.lrem('queue:jobs', 0, id);
    await redis.zrem('delayed:jobs', id);
    
    // Delete from DB
    await query('DELETE FROM jobs WHERE id=$1', [id]);

    logger.info({ jobId: id }, 'job deleted');
    
    // Emit job_deleted event
    await redisPub.publish('jobs:events', JSON.stringify({ type: 'job_deleted', jobId: id }));
    
    return res.status(200).json({ id, deleted: true });
  } catch (err:any) {
    logger.error({ err, jobId: id }, 'delete job error');
    return res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /control/pause:
 *   post:
 *     summary: Pause queue processing
 *     description: Pause all workers from processing new jobs. Requires API key.
 *     tags: [Control]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Queue paused
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paused:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Unauthorized - API key required
 */
// Pause queue processing (sets Redis key) - protected endpoint
app.post('/control/pause', strictLimiter as unknown as express.RequestHandler, apiKeyAuth, async (_req, res) => {
  try {
    await redis.set('queue:paused', '1');
    logger.info('queue paused via API');
    // Publish event for any listeners
    await redisPub.publish('jobs:events', JSON.stringify({ type: 'queue_paused' }));
    res.json({ paused: true });
  } catch (err:any) {
    logger.error({ err }, 'pause failed');
    res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /control/resume:
 *   post:
 *     summary: Resume queue processing
 *     description: Resume workers to process jobs. Requires API key.
 *     tags: [Control]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Queue resumed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paused:
 *                   type: boolean
 *                   example: false
 *       401:
 *         description: Unauthorized - API key required
 */
// Resume processing - protected endpoint
app.post('/control/resume', strictLimiter as unknown as express.RequestHandler, apiKeyAuth, async (_req, res) => {
  try {
    await redis.del('queue:paused');
    logger.info('queue resumed via API');
    // Publish event for any listeners
    await redisPub.publish('jobs:events', JSON.stringify({ type: 'queue_resumed' }));
    res.json({ paused: false });
  } catch (err:any) {
    logger.error({ err }, 'resume failed');
    res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /stats:
 *   get:
 *     summary: Get queue statistics
 *     description: Get current queue depth and job counts by status
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Queue statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stats'
 */
// Dashboard stats endpoint (JSON format for frontend)
app.get('/stats', async (_req, res) => {
  try {
    const queueDepth = await redis.llen('queue:jobs');
    
    const statsResult = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'succeeded') as succeeded,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'dead_letter') as dead_letter,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM jobs
    `);
    
    const stats = statsResult.rows[0] || {};
    res.json({
      queue_depth: queueDepth,
      in_progress: parseInt(stats.in_progress) || 0,
      succeeded: parseInt(stats.succeeded) || 0,
      failed: parseInt(stats.failed) || 0,
      dead_letter: parseInt(stats.dead_letter) || 0,
      pending: parseInt(stats.pending) || 0,
    });
  } catch (err: any) {
    logger.error({ err }, 'stats error');
    res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /workers:
 *   get:
 *     summary: List active workers
 *     description: Get all registered workers with their status and metrics
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: List of workers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 workers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       hostname:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [active, idle, draining, offline]
 *                       concurrency:
 *                         type: integer
 *                       jobs_processed:
 *                         type: integer
 *                       jobs_failed:
 *                         type: integer
 *                       current_job_id:
 *                         type: string
 *                         nullable: true
 *                       last_heartbeat:
 *                         type: string
 *                         format: date-time
 *                       started_at:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 active:
 *                   type: integer
 */
app.get('/workers', async (_req, res) => {
  try {
    // Mark workers as offline if no heartbeat in 30 seconds
    const staleThreshold = new Date(Date.now() - 30000).toISOString();
    await query(
      `UPDATE workers SET status = 'offline', updated_at = now() 
       WHERE status != 'offline' AND last_heartbeat < $1`,
      [staleThreshold]
    );
    
    const result = await query(`
      SELECT id, hostname, pid, concurrency, status, jobs_processed, jobs_failed, 
             current_job_id, last_heartbeat, started_at
      FROM workers 
      ORDER BY status ASC, last_heartbeat DESC
    `);
    
    const workers = result.rows;
    const active = workers.filter(w => w.status === 'active' || w.status === 'idle').length;
    
    res.json({
      workers,
      total: workers.length,
      active,
    });
  } catch (err: any) {
    logger.error({ err }, 'workers list error');
    res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /workers/{id}:
 *   delete:
 *     summary: Remove a worker registration
 *     description: Remove an offline worker from the registry
 *     tags: [Monitoring]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Worker removed
 *       404:
 *         description: Worker not found
 */
app.delete('/workers/:id', apiKeyAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query('DELETE FROM workers WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    logger.info({ workerId: id }, 'worker removed from registry');
    res.json({ id, removed: true });
  } catch (err: any) {
    logger.error({ err, workerId: id }, 'worker delete error');
    res.status(500).json({ error: 'internal' });
  }
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: Get Prometheus-formatted metrics for monitoring
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Prometheus metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
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

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check if API, database, and Redis are healthy
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: All systems healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *       500:
 *         description: Health check failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: fail
 *                 error:
 *                   type: string
 */
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

