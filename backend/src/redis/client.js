import Redis from 'ioredis';

import { createLogger } from '../logging.js';

const clients = new Map();

class InMemoryRedis {
  constructor() {
    this.store = new Map();
    this.expirations = new Map();
    this.status = 'ready';
  }

  // eslint-disable-next-line class-methods-use-this
  on() {}

  async connect() {
    this.status = 'ready';
    return this;
  }

  async quit() {
    this.store.clear();
    this.expirations.clear();
    this.status = 'end';
  }

  async get(key) {
    this.#purgeIfExpired(key);
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key, value, ...args) {
    let ttlMs;
    let nxMode = false;

    for (let i = 0; i < args.length; i += 1) {
      const token = args[i];
      if (typeof token !== 'string') {
        continue;
      }
      const upper = token.toUpperCase();
      if (upper === 'NX') {
        nxMode = true;
      } else if (upper === 'PX' || upper === 'EX') {
        const amount = Number(args[i + 1]);
        if (Number.isFinite(amount)) {
          ttlMs = upper === 'PX' ? amount : amount * 1000;
        }
        i += 1;
      }
    }

    if (nxMode) {
      this.#purgeIfExpired(key);
      if (this.store.has(key)) {
        return null;
      }
    }

    this.store.set(key, value);
    if (Number.isFinite(ttlMs) && ttlMs > 0) {
      this.expirations.set(key, Date.now() + ttlMs);
    } else {
      this.expirations.delete(key);
    }

    return 'OK';
  }

  async del(key) {
    this.expirations.delete(key);
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key) {
    this.#purgeIfExpired(key);
    const current = Number(this.store.get(key) || 0);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async pexpire(key, ttlMs) {
    if (!this.store.has(key)) {
      return 0;
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      this.expirations.delete(key);
      return 1;
    }
    this.expirations.set(key, Date.now() + ttlMs);
    return 1;
  }

  async pttl(key) {
    this.#purgeIfExpired(key);
    if (!this.store.has(key)) {
      return -2;
    }
    const expiresAt = this.expirations.get(key);
    if (!expiresAt) {
      return -1;
    }
    const remaining = expiresAt - Date.now();
    return remaining > 0 ? remaining : -2;
  }

  #purgeIfExpired(key) {
    const expiresAt = this.expirations.get(key);
    if (expiresAt && expiresAt <= Date.now()) {
      this.expirations.delete(key);
      this.store.delete(key);
    }
  }
}

export function getRedisClient(options = {}) {
  const { name = 'default', env = process.env } = options;
  if (clients.has(name)) {
    return clients.get(name);
  }

  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'backend-api' });
  const url = env.REDIS_URL || 'redis://redis:6379';
  const driver = String(env.REDIS_DRIVER || '').toLowerCase();
  const useMemory = driver === 'memory' || url.startsWith('memory://');
  const client = useMemory ? new InMemoryRedis() : new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });

  if (!useMemory) {
    client.on('error', (error) => {
      logger({ level: 'error', message: 'redis_error', name, error: error.message });
    });
    client.on('connect', () => {
      logger({ level: 'info', message: 'redis_connected', name });
    });
  }

  clients.set(name, client);
  return client;
}

export async function ensureRedis(options = {}) {
  const client = getRedisClient(options);
  if (client.status === 'ready') return client;
  await client.connect();
  return client;
}

export const internals = { InMemoryRedis };
