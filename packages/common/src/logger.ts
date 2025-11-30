import pino from 'pino';
import dotenv from 'dotenv';
dotenv.config();

const pretty = process.env.NODE_ENV !== 'production';

export const logger = pino(
  pretty
    ? {
        transport: { target: 'pino-pretty', options: { colorize: true } }
      }
    : {}
);

export default logger;
