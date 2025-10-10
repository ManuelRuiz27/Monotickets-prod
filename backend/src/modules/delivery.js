import { randomUUID } from 'node:crypto';

import { query } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';

const DEFAULT_CHANNEL = 'whatsapp';
const SUPPORTED_CHANNELS = new Set(['whatsapp', 'email']);
const DEFAULT_TEMPLATE = 'event_invitation';

export function createDeliveryModule(options = {}) {
  const { env = process.env, queuesPromise, logger } = options;
  if (!queuesPromise) {
    throw new Error('queuesPromise is required for delivery module');
  }
  const log = logger || ((payload) => console.log(JSON.stringify(payload)));

  async function enqueueSend({ eventId, guestId, body = {}, requestId }) {
    const channel = selectChannel(body?.channel);
    const template = body?.template || DEFAULT_TEMPLATE;
    const organizerId = body?.organizerId || env.DEFAULT_ORGANIZER_ID || '00000000-0000-0000-0000-000000000000';
    if (!body?.organizerId && !env.DEFAULT_ORGANIZER_ID) {
      log({ level: 'warn', message: 'delivery_missing_organizer', event_id: eventId, guest_id: guestId });
    }
    const payload = body?.payload || {};

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
    const jobPayload = {
      deliveryLogId,
      eventId,
      guestId,
      organizerId,
      channel,
      template,
      payload,
      requestId,
    };

    let job;
    try {
      job = await queues.deliveryQueue.add('send', jobPayload, {
        attempts: 5,
        backoff: { type: 'exponential', delay: Number(env.DELIVERY_BACKOFF_DELAY_MS || 5000) },
        removeOnComplete: true,
        removeOnFail: false,
      });
    } catch (error) {
      log({ level: 'error', message: 'delivery_enqueue_failed', error: error.message, event_id: eventId, guest_id: guestId });
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
      statusCode: 202,
      payload: {
        status: 'queued',
        jobId: job.id,
        deliveryLogId,
      },
    };
  }

  async function enqueueWebhook({ body = {}, requestId }) {
    const queues = await queuesPromise;
    const jobPayload = {
      webhookId: randomUUID(),
      payload: body,
      receivedAt: new Date().toISOString(),
      requestId,
    };

    const job = await queues.waInboundQueue.add('wa-webhook', jobPayload, {
      attempts: 5,
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
    enqueueSend,
    enqueueWebhook,
    getSession,
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
