import http from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import Redis from 'ioredis';
import logger from '@jobqueue/common/src/logger';

let io: IOServer | null = null;

export function setupSocket(server: http.Server) {
  if (io) return io;
  
  io = new IOServer(server, { 
    path: '/socket.io', 
    cors: { origin: '*' } 
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ sid: socket.id }, 'socket connected');
    socket.on('disconnect', () => {
      logger.info({ sid: socket.id }, 'socket disconnected');
    });
  });

  // Subscribe to Redis channel to broadcast worker events to all connected clients
  const sub = new Redis({ 
    host: process.env.REDIS_HOST || '127.0.0.1', 
    port: Number(process.env.REDIS_PORT || '6379') 
  });
  
  sub.subscribe('jobs:events', (err) => { 
    if (err) {
      logger.error({ err }, 'Redis subscribe error');
    } else {
      logger.info('Subscribed to jobs:events channel');
    }
  });
  
  sub.on('message', (_channel, message) => {
    try {
      const payload = JSON.parse(message);
      if (payload.type === 'job_created') {
        io?.emit('job_created', payload.job);
        logger.debug({ jobId: payload.job?.id }, 'emitted job_created');
      }
      if (payload.type === 'job_updated') {
        io?.emit('job_updated', payload.job);
        logger.debug({ jobId: payload.job?.id }, 'emitted job_updated');
      }
      if (payload.type === 'queue_paused') {
        io?.emit('queue_paused', { paused: true });
      }
      if (payload.type === 'queue_resumed') {
        io?.emit('queue_resumed', { paused: false });
      }
    } catch (e) { 
      logger.error({ err: e }, 'Invalid pubsub message'); 
    }
  });

  logger.info('Socket.IO server initialized');
  return io;
}

export function getIO(): IOServer | null {
  return io;
}

// Helper to emit job_created directly (for API-created jobs)
export function emitJobCreated(job: any) { 
  if (io) {
    io.emit('job_created', job);
    logger.debug({ jobId: job?.id }, 'emitted job_created (direct)');
  }
}

// Helper to emit job_updated directly
export function emitJobUpdated(job: any) { 
  if (io) {
    io.emit('job_updated', job);
    logger.debug({ jobId: job?.id }, 'emitted job_updated (direct)');
  }
}
