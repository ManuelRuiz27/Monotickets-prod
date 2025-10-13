import { ensureRedis } from '../redis/client.js';

export const DELIVERY_STATUS_CACHE_PREFIX = 'delivery:status';
const DEFAULT_STATUS_CACHE_TTL = 45;
const CACHE_INDEX_KEY = `${DELIVERY_STATUS_CACHE_PREFIX}:keys`;

export function buildDeliveryStatusCacheKey({ requestId, providerRef }) {
  if (providerRef) {
    return `${DELIVERY_STATUS_CACHE_PREFIX}:provider:${providerRef}`;
  }
  return `${DELIVERY_STATUS_CACHE_PREFIX}:request:${requestId}`;
}

export async function getCachedDeliveryStatus({ requestId, providerRef, env = process.env }) {
  const key = buildDeliveryStatusCacheKey({ requestId, providerRef });
  const redis = await ensureRedis({ name: 'delivery-status-cache', env });
  const cached = await redis.get(key);
  if (!cached) {
    return { key, cached: null };
  }
  try {
    return { key, cached: JSON.parse(cached) };
  } catch {
    await redis.del(key).catch(() => {});
    return { key, cached: null };
  }
}

export async function cacheDeliveryStatus({
  requestId,
  providerRef,
  summary,
  env = process.env,
  ttlSeconds,
}) {
  if (!summary) return null;
  const ttl = Math.max(15, Number(ttlSeconds || DEFAULT_STATUS_CACHE_TTL));
  const key = buildDeliveryStatusCacheKey({ requestId, providerRef });
  const redis = await ensureRedis({ name: 'delivery-status-cache', env });
  await redis.set(key, JSON.stringify(summary), 'EX', ttl);
  await redis.sadd(CACHE_INDEX_KEY, key);
  return key;
}

export async function invalidateDeliveryStatusCache({ requestId, providerRef, env = process.env }) {
  const key = buildDeliveryStatusCacheKey({ requestId, providerRef });
  try {
    const redis = await ensureRedis({ name: 'delivery-status-cache', env });
    await redis.del(key);
    await redis.srem(CACHE_INDEX_KEY, key);
  } catch {
    /* ignore cache errors */
  }
}

export async function flushDeliveryStatusCaches(env = process.env) {
  try {
    const redis = await ensureRedis({ name: 'delivery-status-cache', env });
    const keys = await redis.smembers(CACHE_INDEX_KEY);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del(CACHE_INDEX_KEY);
  } catch {
    /* ignore cache errors */
  }
}
