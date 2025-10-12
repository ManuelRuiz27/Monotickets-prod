import { randomUUID } from 'node:crypto';

import { query } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';

const DEFAULT_CHANNEL = 'whatsapp';
const SUPPORTED_CHANNELS = new Set(['whatsapp', 'email']);
const DEFAULT_TEMPLATE = 'event_invitation';
const DEFAULT_ORGANIZER = '00000000-0000-0000-0000-000000000000';
const DEFAULT_DEDUPE_WINDOW_MINUTES = 1440;
const DEDUPE_PREFIX = 'delivery:dedupe';

export function createDeliveryModule(options = {}) {
  const { env = process.env, queuesPromise, logger } = options;
  if (!queuesPromise) {
    throw new Error('queuesPromise is required for delivery module');
  }

  const log = logger || ((payload) => console.log(JSON.stringify(payload)));
  const dedupeWindowMinutes = Number(env.DELIVERY_DEDUPE_WINDOW_MIN || DEFAULT_DEDUPE_WINDOW_MINUTES);

  async function send({ body = {}, requestId }) {
    const eventId = normalizeId(body.eventId || body.event_id);
    const guestIds = collectGuestIds(body);
    const channel = selectChannel(body.channel);
    const template = typeof body.template === 'string' ? body.template : DEFAULT_TEMPLATE;
    const organizerId = normalizeId(body.organizerId || env.DEFAULT_ORGANIZER_ID || DEFAULT_ORGANIZER);
    const payload = typeof body.payload === 'object' && body.payload !== null ? body.payload : {};

    if (!eventId) {
      return { statusCode: 400, payload: { error: 'event_id_required' } };
    }

    if (guestIds.length === 0) {
      return { statusCode: 400, payload: { error: 'guest_ids_required' } };
    }

    const results = [];
    for (const guestId of guestIds) {
      try {
        const result = await enqueueOutbound({
          eventId,
          guestId,
          organizerId,
          channel,
          template,
          payload,
          requestId,
          metadata: body.metadata,
        });
        results.push(result);
      } catch (error) {
        log({
          level: 'error',
          message: 'delivery_send_failed',
          error: error.message,
          event_id: eventId,
          guest_id: guestId,
          request_id: requestId,
        });
        results.push({ guestId, status: 'failed', error: 'enqueue_failed' });
      }
    }

    const queuedCount = results.filter((item) => item.status === 'queued').length;
    return {
      statusCode: queuedCount > 0 ? 202 : 200,
      payload: {
        status: queuedCount > 0 ? 'queued' : results[0]?.status || 'ok',
        deliveries: results,
      },
    };
  }

  async function enqueueLegacySend({ eventId, guestId, body = {}, requestId }) {
    const organizerId = normalizeId(body.organizerId || env.DEFAULT_ORGANIZER_ID || DEFAULT_ORGANIZER);
    const channel = selectChannel(body.channel);
    const template = typeof body.template === 'string' ? body.template : DEFAULT_TEMPLATE;
    const payload = typeof body.payload === 'object' && body.payload !== null ? body.payload : {};

    const result = await enqueueOutbound({
      eventId,
      guestId,
      organizerId,
      channel,
      template,
      payload,
      requestId,
      metadata: body.metadata,
    });

    return {
      statusCode: result.status === 'queued' ? 202 : 200,
      payload: {
        status: result.status,
        jobId: result.jobId,
        deliveryLogId: result.deliveryLogId,
        duplicateOf: result.duplicateOf,
      },
    };
  }

  async function enqueueOutbound({
    eventId,
    guestId,
    organizerId,
    channel,
    template,
    payload,
    requestId,
    metadata,
  }) {
    const redis = await ensureRedis({ name: 'delivery-dedupe', env });
    const dedupeKey = buildDedupeKey({ eventId, guestId, template });
    const dedupeValue = requestId || randomUUID();
    const dedupeTtlSeconds = Math.max(60, dedupeWindowMinutes * 60);

    const dedupeResult = await redis.set(dedupeKey, dedupeValue, 'NX', 'EX', dedupeTtlSeconds);
    if (dedupeResult !== 'OK') {
      const existing = await findRecentDeliveryLog({ eventId, guestId, template, windowMinutes: dedupeWindowMinutes });
      log({
        level: 'info',
        message: 'delivery_deduped',
        event_id: eventId,
        guest_id: guestId,
        template,
        request_id: requestId,
        duplicate_of: existing?.id || null,
      });
      return {
        guestId,
        status: 'duplicate',
        duplicateOf: existing?.id || null,
      };
    }

    let deliveryLogId;
    try {
      const result = await query(
        `INSERT INTO delivery_logs (organizer_id, event_id, guest_id, channel, template, status, provider_ref, error)
         VALUES ($1, $2, $3, $4, $5, 'queued', NULL, NULL)
         RETURNING id`,
        [organizerId, eventId, guestId, channel, template],
      );
      deliveryLogId = result.rows[0]?.id;
    } catch (error) {
      log({
        level: 'error',
        message: 'delivery_log_insert_failed',
        error: error.message,
        event_id: eventId,
        guest_id: guestId,
        request_id: requestId,
      });
    }

    const queues = await queuesPromise;
    const outboundQueue = queues.waOutboundQueue || queues.deliveryQueue;
    const jobPayload = {
      deliveryLogId,
      eventId,
      guestId,
      organizerId,
      channel,
      template,
      payload,
      metadata: sanitizeMetadata(metadata),
      requestId,
    };

    const jobOptions = {
      attempts: Number(env.DELIVERY_MAX_RETRIES || 5),
      backoff: { type: 'exponential', delay: Number(env.QUEUE_BACKOFF_DELAY_MS || 5000) },
      removeOnComplete: true,
      removeOnFail: false,
      jobId: `delivery:${guestId}:${template}:${Date.now()}`,
    };

    let job;
    try {
      job = await outboundQueue.add('send', jobPayload, jobOptions);
    } catch (error) {
      await redis.del(dedupeKey);
      log({
        level: 'error',
        message: 'delivery_enqueue_failed',
        error: error.message,
        event_id: eventId,
        guest_id: guestId,
        request_id: requestId,
      });
      if (deliveryLogId) {
        await query(
          `UPDATE delivery_logs SET status = 'failed', error = $1::jsonb, updated_at = now() WHERE id = $2`,
          [JSON.stringify({ message: error.message, stage: 'enqueue' }), deliveryLogId],
        );
      }
      throw error;
    }

    log({
      level: 'info',
      message: 'delivery_enqueued',
      job_id: job.id,
      delivery_log_id: deliveryLogId,
      channel,
      event_id: eventId,
      guest_id: guestId,
      request_id: requestId,
    });

    return {
      guestId,
      status: 'queued',
      jobId: job.id,
      deliveryLogId,
    };
  }

  async function enqueueWebhook({ body = {}, requestId }) {
    const queues = await queuesPromise;
    const inboundQueue = queues.waInboundQueue;
    const jobPayload = {
      webhookId: randomUUID(),
      payload: body,
      receivedAt: new Date().toISOString(),
      requestId,
    };

    const job = await inboundQueue.add('wa-webhook', jobPayload, {
      attempts: Number(env.DELIVERY_MAX_RETRIES || 5),
      backoff: { type: 'exponential', delay: Number(env.WA_WEBHOOK_BACKOFF_DELAY_MS || 2000) },
      removeOnComplete: true,
      removeOnFail: false,
    });

    log({
      level: 'info',
      message: 'wa_webhook_enqueued',
      job_id: job.id,
      request_id: requestId,
    });

    return {
      statusCode: 200,
      payload: { ok: true, jobId: job.id },
    };
  }

  async function getStatus({ deliveryId }) {
    if (!deliveryId) {
      return { statusCode: 400, payload: { error: 'delivery_id_required' } };
    }

    const lookup = await findDeliveryStatus(deliveryId);
    if (!lookup) {
      return { statusCode: 404, payload: { error: 'not_found' } };
    }

    return {
      statusCode: 200,
      payload: {
        deliveryId: lookup.id,
        status: lookup.status,
        channel: lookup.channel,
        template: lookup.template,
        providerRef: lookup.provider_ref,
        error: lookup.error,
        updatedAt: lookup.updated_at,
      },
    };
  }

  async function getSession({ phone }) {
    if (!phone) {
      return {
        statusCode: 400,
        payload: { error: 'phone_required' },
      };
    }
    const client = await ensureRedis({ name: 'wa-sessions', env });
    const sessionKey = getSessionKey(phone);
    const ttlSeconds = await client.ttl(sessionKey);
    if (ttlSeconds > 0) {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      return {
        statusCode: 200,
        payload: { phone, status: 'open', expiresAt, ttlSeconds },
      };
    }

    let dbSession;
    try {
      dbSession = await query(
        'SELECT phone, opened_at, expires_at FROM wa_sessions WHERE phone = $1',
        [phone],
      );
    } catch (error) {
      log({
        level: 'error',
        message: 'wa_session_lookup_failed',
        error: error.message,
        phone,
      });
      return {
        statusCode: 503,
        payload: { phone, status: 'unknown', error: 'session_lookup_failed' },
      };
    }
    if (dbSession.rowCount === 0) {
      return {
        statusCode: 404,
        payload: { phone, status: 'closed' },
      };
    }

    const row = dbSession.rows[0];
    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    const status = expiresAt > now ? 'open' : 'closed';

    if (status === 'open') {
      const ttl = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
      if (ttl > 0) {
        await client.set(sessionKey, 'open', 'EX', ttl);
      }
    }

    return {
      statusCode: 200,
      payload: {
        phone: row.phone,
        status,
        openedAt: row.opened_at,
        expiresAt: row.expires_at,
      },
    };
  }

  return {
    send,
    enqueueLegacySend,
    enqueueWebhook,
    getSession,
    getStatus,
  };
}

function selectChannel(channel) {
  if (typeof channel === 'string' && SUPPORTED_CHANNELS.has(channel)) {
    return channel;
  }
  return DEFAULT_CHANNEL;
}

function getSessionKey(phone) {
  return `wa:session:${phone}`;
}

function collectGuestIds(body) {
  if (Array.isArray(body.guestIds)) {
    return body.guestIds.filter((id) => typeof id === 'string').map((id) => id.trim()).filter(Boolean);
  }
  if (Array.isArray(body.guests)) {
    return body.guests
      .map((item) => (typeof item === 'string' ? item : item?.id))
      .filter((id) => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  if (typeof body.guestId === 'string' && body.guestId.trim()) {
    return [body.guestId.trim()];
  }
  if (typeof body.guest_id === 'string' && body.guest_id.trim()) {
    return [body.guest_id.trim()];
  }
  return [];
}

function normalizeId(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
}

function buildDedupeKey({ eventId, guestId, template }) {
  return `${DEDUPE_PREFIX}:${eventId || 'unknown'}:${guestId || 'unknown'}:${template}`;
}

async function findRecentDeliveryLog({ eventId, guestId, template, windowMinutes }) {
  const interval = Math.max(1, Number(windowMinutes || DEFAULT_DEDUPE_WINDOW_MINUTES));
  const result = await query(
    `SELECT id, status
       FROM delivery_logs
      WHERE event_id = $1 AND guest_id = $2 AND template = $3 AND created_at >= now() - ($4 || ' minutes')::interval
      ORDER BY created_at DESC
      LIMIT 1`,
    [eventId, guestId, template, interval],
  ).catch(() => ({ rowCount: 0 }));
  return result?.rows?.[0] || null;
}

async function findDeliveryStatus(identifier) {
  if (/^\d+$/.test(identifier)) {
    const result = await query('SELECT * FROM delivery_logs WHERE id = $1', [Number(identifier)]);
    return result.rows[0] || null;
  }
  const result = await query(
    `SELECT * FROM delivery_logs WHERE provider_ref = $1 ORDER BY updated_at DESC LIMIT 1`,
    [identifier],
  );
  return result.rows[0] || null;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    return null;
  }
}
