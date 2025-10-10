import Redis from 'ioredis';

import { createLogger } from '../logging.js';

const clients = new Map();

export function getRedisClient(options = {}) {
  const { name = 'default', env = process.env } = options;
  if (clients.has(name)) {
    return clients.get(name);
  }

  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'backend-api' });
  const url = env.REDIS_URL || 'redis://redis:6379';
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });

  client.on('error', (error) => {
    logger({ level: 'error', message: 'redis_error', name, error: error.message });
  });
  client.on('connect', () => {
    logger({ level: 'info', message: 'redis_connected', name });
  });

  clients.set(name, client);
  return client;
}

export async function ensureRedis(options = {}) {
  const client = getRedisClient(options);
  if (client.status === 'ready') return client;
  await client.connect();
  return client;
}
