import { randomUUID } from 'node:crypto';

import { query } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';
import { createLogger } from '../logging.js';

const DEFAULT_TTL_DAYS = 180;
const MAX_TTL_DAYS = 365;
const MIN_TTL_DAYS = 30;

export async function runLandingTtlJob(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'workers' });
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const redis = await ensureRedis({ name: 'landing-ttl', env });
  const lockKey = env.LANDING_TTL_LOCK_KEY || 'locks:landing-ttl';
  const lockTtl = Number(env.LANDING_TTL_LOCK_TTL_SECONDS || 3600);
  const lockId = randomUUID();

  if (!force) {
    const acquired = await redis.set(lockKey, lockId, 'NX', 'EX', lockTtl);
    if (acquired !== 'OK') {
      logger({ level: 'info', message: 'landing_ttl_lock_skipped' });
      return;
    }
  }

  try {
    const result = await query(
      `SELECT id, status, landing_ttl_days, ends_at FROM events WHERE status IN ('active', 'archived') ORDER BY ends_at ASC`
    );
    const now = new Date();
    const updates = [];

    for (const row of result.rows) {
      const ttlDays = normalizeTtl(row.landing_ttl_days, env);
      if (row.status === 'active' && row.ends_at && new Date(row.ends_at) < now) {
        updates.push({ id: row.id, from: 'active', to: 'archived' });
      }
      if (row.status === 'archived' && row.ends_at) {
        const expiresAt = new Date(row.ends_at);
        expiresAt.setDate(expiresAt.getDate() + ttlDays);
        if (expiresAt < now) {
          updates.push({ id: row.id, from: 'archived', to: 'expired' });
        }
      }
    }

    logger({ level: 'info', message: 'landing_ttl_job_evaluated', updates: updates.length, dry_run: dryRun });

    if (dryRun || updates.length === 0) {
      return;
    }

    for (const update of updates) {
      await query('UPDATE events SET status = $1 WHERE id = $2 AND status = $3', [
        update.to,
        update.id,
        update.from,
      ]);
      await invalidateLandingCaches(update.id, env, logger);
    }
  } finally {
    if (!force) {
      const current = await redis.get(lockKey);
      if (current === lockId) {
        await redis.del(lockKey);
      }
    }
  }
}

function normalizeTtl(value, env = process.env) {
  const fallback = Number(env.LANDING_TTL_DEFAULT_DAYS || DEFAULT_TTL_DAYS);
  const input = Number(value || fallback);
  const clamped = Math.min(Math.max(input, MIN_TTL_DAYS), MAX_TTL_DAYS);
  return clamped;
}

async function invalidateLandingCaches(eventId, env, logger) {
  const redis = await ensureRedis({ name: 'landing-cache', env });
  const keys = [`landing:${eventId}`, `landing:dashboard:${eventId}`];
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  logger({ level: 'info', message: 'landing_cache_invalidated', event_id: eventId });
}
