import { randomUUID } from 'node:crypto';

import { query } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';

const DEFAULT_CHANNEL = 'whatsapp';
const SUPPORTED_CHANNELS = new Set(['whatsapp', 'email']);
const DEFAULT_TEMPLATE = 'event_invitation';
const DEFAULT_ORGANIZER = '00000000-0000-0000-0000-000000000000';
const DEFAULT_DEDUPE_WINDOW_MINUTES = 1440;
const DEDUPE_PREFIX = 'delivery:dedupe';
const SIGNATURE_HEADER_KEYS = ['x-wa-signature', 'x-360dialog-signature', 'x-hub-signature'];

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
        requestId: result.requestId,
        correlationId: result.correlationId,
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
      const existing = await findRecentDeliveryRequest({
        eventId,
        guestId,
        template,
        windowMinutes: dedupeWindowMinutes,
      });
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

    const sanitizedMetadata = sanitizeMetadata(metadata);

    const request = await createDeliveryRequest({
      organizerId,
      eventId,
      guestId,
      channel,
      template,
      payload,
      metadata: sanitizedMetadata,
      dedupeKey,
    });

    const queues = await queuesPromise;
    const outboundQueue = queues.waOutboundQueue || queues.deliveryQueue;
    const jobPayload = {
      requestId: request.id,
      eventId,
      guestId,
      organizerId,
      channel,
      template,
      payload,
      metadata: sanitizedMetadata,
      requestIdHeader: requestId,
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
      await markRequestFailureOnEnqueue(request.id, error);
      throw error;
    }

    await recordJobQueued(request.id, job.id);

    log({
      level: 'info',
      message: 'delivery_enqueued',
      job_id: job.id,
      request_id: request.id,
      correlation_id: request.correlationId,
      channel,
      event_id: eventId,
      guest_id: guestId,
      template,
    });

    return {
      guestId,
      status: 'queued',
      jobId: job.id,
      requestId: request.id,
      correlationId: request.correlationId,
    };
  }

  async function enqueueWebhook({ body = {}, headers = {}, requestId }) {
    const secret = env.WA_WEBHOOK_SECRET;
    if (secret) {
      const signature = findSignatureHeader(headers);
      if (!signature || signature !== secret) {
        log({
          level: 'warn',
          message: 'wa_webhook_signature_invalid',
          request_id: requestId,
        });
        return { statusCode: 401, payload: { error: 'invalid_signature' } };
      }
    }

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

    let summary;
    if (/^\d+$/.test(deliveryId)) {
      summary = await findDeliverySummaryByRequestId(Number(deliveryId));
      if (!summary) {
        summary = await findDeliveryAttemptById(Number(deliveryId));
      }
    } else {
      summary = await findDeliverySummaryByProviderRef(deliveryId);
    }

    if (!summary) {
      return { statusCode: 404, payload: { error: 'not_found' } };
    }

    return {
      statusCode: 200,
      payload: summary,
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

async function createDeliveryRequest({
  organizerId,
  eventId,
  guestId,
  channel,
  template,
  payload,
  metadata,
  dedupeKey,
}) {
  const payloadJson = JSON.stringify(payload ?? {});
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const result = await query(
    `
      INSERT INTO delivery_requests (
        organizer_id,
        event_id,
        guest_id,
        channel,
        template,
        payload,
        metadata,
        dedupe_key
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
      RETURNING id, correlation_id
    `,
    [organizerId, eventId, guestId, channel, template, payloadJson, metadataJson, dedupeKey],
  );
  return {
    id: result.rows[0].id,
    correlationId: result.rows[0].correlation_id,
  };
}

async function recordJobQueued(requestId, jobId) {
  await query(
    `
      UPDATE delivery_requests
         SET last_job_id = $1,
             current_status = 'queued',
             updated_at = now()
       WHERE id = $2
    `,
    [jobId, requestId],
  );
}

async function markRequestFailureOnEnqueue(requestId, error) {
  await query(
    `
      UPDATE delivery_requests
         SET current_status = 'failed',
             last_error = $1::jsonb,
             updated_at = now()
       WHERE id = $2
    `,
    [JSON.stringify({ message: error.message, stage: 'enqueue' }), requestId],
  );
}

async function findRecentDeliveryRequest({ eventId, guestId, template, windowMinutes }) {
  const interval = Math.max(1, Number(windowMinutes || DEFAULT_DEDUPE_WINDOW_MINUTES));
  const result = await query(
    `SELECT id, current_status
       FROM delivery_requests
      WHERE event_id = $1
        AND guest_id = $2
        AND template = $3
        AND created_at >= now() - ($4 || ' minutes')::interval
      ORDER BY created_at DESC
      LIMIT 1`,
    [eventId, guestId, template, interval],
  ).catch(() => ({ rowCount: 0 }));
  return result?.rows?.[0] || null;
}

async function findDeliverySummaryByRequestId(requestId) {
  const result = await query(
    `
      SELECT
        dr.*,
        latest.id AS attempt_id,
        latest.attempt AS attempt_number,
        latest.status AS attempt_status,
        latest.provider_ref AS attempt_provider_ref,
        latest.error AS attempt_error,
        latest.started_at AS attempt_started_at,
        latest.completed_at AS attempt_completed_at,
        latest.created_at AS attempt_created_at
      FROM delivery_requests dr
      LEFT JOIN LATERAL (
        SELECT *
          FROM delivery_logs
         WHERE request_id = dr.id
         ORDER BY attempt DESC
         LIMIT 1
      ) AS latest ON TRUE
      WHERE dr.id = $1
    `,
    [requestId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return mapDeliverySummary(row);
}

async function findDeliverySummaryByProviderRef(providerRef) {
  const result = await query(
    `
      SELECT
        dr.*,
        dl.id AS attempt_id,
        dl.attempt AS attempt_number,
        dl.status AS attempt_status,
        dl.provider_ref AS attempt_provider_ref,
        dl.error AS attempt_error,
        dl.started_at AS attempt_started_at,
        dl.completed_at AS attempt_completed_at,
        dl.created_at AS attempt_created_at
      FROM delivery_logs dl
      JOIN delivery_requests dr
        ON dr.id = dl.request_id
      WHERE dl.provider_ref = $1
      ORDER BY dl.created_at DESC
      LIMIT 1
    `,
    [providerRef],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapDeliverySummary(result.rows[0]);
}

async function findDeliveryAttemptById(attemptId) {
  const result = await query(
    `
      SELECT
        dr.*,
        dl.id AS attempt_id,
        dl.attempt AS attempt_number,
        dl.status AS attempt_status,
        dl.provider_ref AS attempt_provider_ref,
        dl.error AS attempt_error,
        dl.started_at AS attempt_started_at,
        dl.completed_at AS attempt_completed_at,
        dl.created_at AS attempt_created_at
      FROM delivery_logs dl
      JOIN delivery_requests dr
        ON dr.id = dl.request_id
      WHERE dl.id = $1
      LIMIT 1
    `,
    [attemptId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapDeliverySummary(result.rows[0]);
}

function mapDeliverySummary(row) {
  return {
    requestId: row.id,
    correlationId: row.correlation_id,
    eventId: row.event_id,
    guestId: row.guest_id,
    organizerId: row.organizer_id,
    channel: row.channel,
    template: row.template,
    currentStatus: row.current_status,
    attemptCount: row.attempt_count,
    lastProviderRef: row.last_provider_ref,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastJobId: row.last_job_id,
    latestAttempt: row.attempt_id
      ? {
          id: row.attempt_id,
          attempt: row.attempt_number,
          status: row.attempt_status,
          providerRef: row.attempt_provider_ref,
          error: row.attempt_error,
          startedAt: row.attempt_started_at,
          completedAt: row.attempt_completed_at,
          createdAt: row.attempt_created_at,
        }
      : null,
  };
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return null;
  }
}

function getSessionKey(phone) {
  return `wa:session:${phone}`;
}

function findSignatureHeader(headers = {}) {
  const headerEntries = Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]);
  for (const candidate of SIGNATURE_HEADER_KEYS) {
    const match = headerEntries.find(([key]) => key === candidate);
    if (!match) continue;
    const value = Array.isArray(match[1]) ? match[1][0] : match[1];
    if (typeof value === 'string') {
      return value.trim();
    }
  }
  return '';
}
