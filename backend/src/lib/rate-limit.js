import { ensureRedis } from '../redis/client.js';

export async function hitRateLimit({ env = process.env, logger, key, limit, windowSeconds }) {
  if (!key) {
    return {
      allowed: true,
      remaining: limit,
      count: 0,
      retryAfterSeconds: 0,
      windowSeconds,
      limit,
    };
  }

  const redis = await ensureRedis({ env, name: 'rate-limit', logger });
  const current = await redis.incr(key);
  let ttlMs = await redis.pttl(key);

  if (current === 1 || ttlMs < 0) {
    ttlMs = windowSeconds * 1000;
    await redis.pexpire(key, ttlMs);
  } else if (ttlMs < 0) {
    ttlMs = windowSeconds * 1000;
  }

  const allowed = current <= limit;
  const remaining = Math.max(limit - current, 0);
  const retryAfterSeconds = allowed ? 0 : Math.max(Math.ceil(ttlMs / 1000), 1);

  return {
    allowed,
    remaining,
    count: current,
    retryAfterSeconds,
    windowSeconds,
    limit,
  };
}
