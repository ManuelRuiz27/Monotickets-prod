import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

import { createLogger } from '../logging.js';

let pool;
let isInitialized = false;

export function getPool(options = {}) {
  if (pool) {
    return pool;
  }

  const { env = process.env } = options;
  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'backend-api' });

  const useMemory = shouldUseMemory(env);
  if (useMemory) {
    pool = createMemoryPool();
  } else {
    const config = buildPoolConfig(env);
    pool = new Pool(config);
    pool.on('error', (error) => {
      logger({ level: 'error', message: 'db_pool_error', error: error.message });
    });
  }

  return pool;
}

export async function initDb(options = {}) {
  if (isInitialized) return getPool(options);
  const instance = getPool(options);
  try {
    await instance.query('SELECT 1');
    isInitialized = true;
  } catch (error) {
    const logger = options.logger || createLogger({ env: options.env || process.env });
    logger({ level: 'error', message: 'db_initialization_failed', error: error.message });
    throw error;
  }
  return instance;
}

export async function withTransaction(fn, options = {}) {
  const client = await getPool(options).connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function query(text, params = [], options = {}) {
  const client = await getPool(options);
  return client.query(text, params);
}

function buildPoolConfig(env = process.env) {
  if (env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL, max: Number(env.DB_POOL_MAX || 10) };
  }
  return {
    host: env.DB_HOST || 'database',
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || 'postgres',
    database: env.DB_NAME || env.DB_USER || 'postgres',
    max: Number(env.DB_POOL_MAX || 10),
  };
}

function shouldUseMemory(env = process.env) {
  const driver = String(env.DB_DRIVER || '').toLowerCase();
  if (driver === 'memory') {
    return true;
  }
  const url = String(env.DATABASE_URL || '').toLowerCase();
  return url.startsWith('memory://');
}

function createMemoryPool() {
  const tables = new Map();

  function ensureTable(name) {
    if (!tables.has(name)) {
      tables.set(name, []);
    }
    return tables.get(name);
  }

  async function execute(text, params = []) {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith('select 1')) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }

    if (normalized.startsWith('create table')) {
      const match = normalized.match(/create table if not exists ([a-z0-9_]+)/);
      if (match) {
        ensureTable(match[1]);
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('create index') || normalized.startsWith('alter table') || normalized.startsWith('do $$')) {
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('create extension')) {
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('insert into users')) {
      const curp = params[0];
      const status = params[1] || 'pending';
      const table = ensureTable('users');
      const existing = table.find((row) => row.curp === curp);
      if (existing) {
        throw new Error('duplicate key value violates unique constraint "users_curp_key"');
      }
      const now = new Date();
      const row = {
        id: randomUUID(),
        curp,
        status,
        last_login_at: null,
        created_at: now,
        updated_at: now,
      };
      table.push(row);
      return { rows: [structuredClone(row)], rowCount: 1 };
    }

    if (normalized.startsWith('select id, curp, status, last_login_at, created_at, updated_at from users where curp')) {
      const curp = params[0];
      const table = ensureTable('users');
      const row = table.find((item) => item.curp === curp);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith('update users set last_login_at = now()')) {
      const userId = params[0];
      const table = ensureTable('users');
      const row = table.find((item) => item.id === userId);
      if (row) {
        const now = new Date();
        row.last_login_at = now;
        row.updated_at = now;
        return { rows: [structuredClone(row)], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('insert into user_refresh_tokens')) {
      const table = ensureTable('user_refresh_tokens');
      const row = {
        id: randomUUID(),
        user_id: params[0],
        token_id: params[1],
        ip_address: params[2],
        user_agent: params[3],
        expires_at: params[4],
        revoked_at: null,
        created_at: new Date(),
      };
      table.push(row);
      return { rows: [structuredClone(row)], rowCount: 1 };
    }

    if (normalized.startsWith('select id, user_id, token_id, revoked_at, expires_at from user_refresh_tokens where token_id')) {
      const tokenId = params[0];
      const table = ensureTable('user_refresh_tokens');
      const row = table.find((item) => item.token_id === tokenId);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith('update user_refresh_tokens set revoked_at = now() where id')) {
      const id = params[0];
      const table = ensureTable('user_refresh_tokens');
      const row = table.find((item) => item.id === id);
      if (row) {
        row.revoked_at = new Date();
        return { rows: [structuredClone(row)], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith('select') && normalized.includes('from user_refresh_tokens')) {
      const table = ensureTable('user_refresh_tokens');
      return { rows: table.map((row) => structuredClone(row)), rowCount: table.length };
    }

    return { rows: [], rowCount: 0 };
  }

  return {
    async query(text, params) {
      return execute(text, params);
    },
    async connect() {
      return {
        query: execute,
        release() {},
      };
    },
    on() {},
  };
}

export const internals = {
  shouldUseMemory,
  createMemoryPool,
};
