import http from 'http';
import app from './server';
import { setupSocket } from './socket';
import logger from '@jobqueue/common/src/logger';

const port = parseInt(process.env.PORT || '3000', 10);
const server = http.createServer(app);

// Initialize Socket.IO with Redis pub/sub
setupSocket(server);

server.listen(port, () => logger.info({ port }, 'API listening'));
