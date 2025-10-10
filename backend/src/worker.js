import net from 'node:net';

import { createLogger } from './logging.js';

const redisUrl = new URL(process.env.REDIS_URL || 'redis://redis:6379');
const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
const logger = createLogger({ env: process.env, service: process.env.SERVICE_NAME || 'workers' });

async function pingRedis() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: redisUrl.hostname, port: Number(redisUrl.port || 6379) }, () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });

    socket.once('data', (chunk) => {
      const response = chunk.toString('utf8').trim();
      socket.end();
      if (response.startsWith('+PONG')) {
        resolve();
      } else {
        reject(new Error(`Unexpected Redis response: ${response}`));
      }
    });

    socket.on('error', (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

async function run() {
  logger({ level: 'info', message: 'worker_started', redis: redisUrl.toString() });
  setInterval(async () => {
    const startedAt = process.hrtime.bigint();
    try {
      await pingRedis();
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger({ level: 'info', message: 'worker_heartbeat', latency_ms: Number(latencyMs.toFixed(3)) });
    } catch (error) {
      logger({ level: 'error', message: 'worker_error', error: error.message });
    }
  }, intervalMs);
}

run().catch((error) => {
  logger({ level: 'fatal', message: 'worker_failed', error: error.message });
  process.exit(1);
});
