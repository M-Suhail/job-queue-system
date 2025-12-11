import http from 'http';
import app, { redis } from './server';
import { setupSocket, closeSocket } from './socket';
import logger from '@jobqueue/common/src/logger';
import { closePool } from '@jobqueue/common/src/db';

const port = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(app);

// Initialize Socket.IO with Redis pub/sub
setupSocket(server);

server.listen(port, () => logger.info({ port }, 'API listening'));

// Graceful shutdown handler
let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');
  
  // Give 10 seconds for graceful shutdown
  const shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 10000);
  
  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });
    
    // Close Socket.IO connections
    closeSocket();
    logger.info('Socket.IO closed');
    
    // Close Redis connection
    await redis.quit();
    logger.info('Redis connection closed');
    
    // Close database pool
    await closePool();
    logger.info('Database pool closed');
    
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
