import http from 'http';
import app from './server';
import logger from '@jobqueue/common/src/logger';
const port = process.env.PORT || 3000;
const server = http.createServer(app);
server.listen(port, () => logger.info({ port }, 'API listening'));
