import { randomUUID } from 'node:crypto';

import { createLogger } from './logging.js';
import { createSimpleWorker, SimpleQueueEvents, SimpleQueue } from './queues/simple-queue.js';
import { ensureRedis } from './redis/client.js';
import { query } from './db/index.js';
import { CircuitBreaker } from './lib/circuit-breaker.js';
import { runLandingTtlJob } from './jobs/landing-ttl.js';

const env = process.env;
const logger = createLogger({ env, service: env.SERVICE_NAME || 'workers' });

const deliveryQueueName = env.WA_OUTBOUND_QUEUE_NAME || env.DELIVERY_QUEUE_NAME || 'wa_outbound';
const waInboundQueueName = env.WA_INBOUND_QUEUE_NAME || 'wa_inbound';
const paymentsQueueName = env.PAYMENTS_QUEUE_NAME || 'paymentsQueue';

const whatsappBreaker = new CircuitBreaker({
  failureThreshold: Number(env.WA_FAILURE_THRESHOLD || 3),
  resetTimeoutMs: Number(env.WA_RESET_TIMEOUT_MS || 60000),
});
const emailBreaker = new CircuitBreaker({
  failureThreshold: Number(env.EMAIL_FAILURE_THRESHOLD || 3),
  resetTimeoutMs: Number(env.EMAIL_RESET_TIMEOUT_MS || 60000),
});

async function main() {
  logger({ level: 'info', message: 'worker_started', queues: [deliveryQueueName, waInboundQueueName, paymentsQueueName] });

  await ensureRedis({ name: 'workers', env });

  await Promise.all([
    bootstrapDeliveryWorker(),
    bootstrapWaInboundWorker(),
    bootstrapPaymentsWorker(),
  ]);

  scheduleLandingJob();
  scheduleQueueMetrics();
}

async function bootstrapDeliveryWorker() {
  const worker = await createSimpleWorker(
    deliveryQueueName,
    async (job) => {
      logger({
        level: 'info',
        message: 'delivery_job_processing',
        job_id: job.id,
        delivery_log_id: job.data.deliveryLogId,
        event_id: job.data.eventId,
        guest_id: job.data.guestId,
        attempt: job.attemptsMade + 1,
      });
      await processDeliveryJob(job.data);
    },
    {
      logger,
      connectionOptions: { env, logger },
      concurrency: Number(env.DELIVERY_WORKER_CONCURRENCY || 4),
      schedulerIntervalMs: Number(env.QUEUE_SCHEDULER_INTERVAL_MS || 1000),
    },
  );

  const events = new SimpleQueueEvents(deliveryQueueName, { connectionOptions: { env, logger } });
  events.on('failed', ({ jobId, job }) => {
    logger({ level: 'error', message: 'delivery_job_failed', job_id: jobId, delivery_log_id: job?.deliveryLogId });
  });
  events.on('dead-letter', ({ jobId, job }) => {
    logger({ level: 'error', message: 'delivery_job_dead_letter', job_id: jobId, delivery_log_id: job?.deliveryLogId });
  });
  events.start();

  return worker;
}

async function bootstrapWaInboundWorker() {
  const worker = await createSimpleWorker(
    waInboundQueueName,
    async (job) => {
      logger({ level: 'info', message: 'wa_webhook_processing', job_id: job.id, webhook_id: job.data.webhookId });
      await processWaWebhook(job.data);
    },
    {
      logger,
      connectionOptions: { env, logger },
      concurrency: Number(env.WA_WEBHOOK_CONCURRENCY || 2),
      schedulerIntervalMs: Number(env.QUEUE_SCHEDULER_INTERVAL_MS || 1000),
    },
  );

  const events = new SimpleQueueEvents(waInboundQueueName, { connectionOptions: { env, logger } });
  events.on('failed', ({ jobId }) => {
    logger({ level: 'error', message: 'wa_webhook_failed', job_id: jobId });
  });
  events.on('dead-letter', ({ jobId }) => {
    logger({ level: 'error', message: 'wa_webhook_dead_letter', job_id: jobId });
  });
  events.start();

  return worker;
}

async function bootstrapPaymentsWorker() {
  const worker = await createSimpleWorker(
    paymentsQueueName,
    async (job) => {
      logger({ level: 'info', message: 'payments_webhook_processing', job_id: job.id, webhook_id: job.data.webhookId });
      await processPaymentsWebhook(job.data);
    },
    {
      logger,
      connectionOptions: { env, logger },
      concurrency: Number(env.PAYMENTS_WORKER_CONCURRENCY || 2),
      schedulerIntervalMs: Number(env.QUEUE_SCHEDULER_INTERVAL_MS || 1000),
    },
  );

  const events = new SimpleQueueEvents(paymentsQueueName, { connectionOptions: { env, logger } });
  events.on('failed', ({ jobId }) => {
    logger({ level: 'error', message: 'payments_webhook_failed', job_id: jobId });
  });
  events.on('dead-letter', ({ jobId }) => {
    logger({ level: 'error', message: 'payments_webhook_dead_letter', job_id: jobId });
  });
  events.start();

  return worker;
}

async function processDeliveryJob(data) {
  const { deliveryLogId, guestId, channel, template, payload } = data;
  const guestResult = await query('SELECT id, phone, email, event_id FROM guests WHERE id = $1', [guestId]);
  if (guestResult.rowCount === 0) {
    await updateDeliveryLog(deliveryLogId, 'failed', null, { error: 'guest_not_found' });
    throw new Error('guest_not_found');
  }

  const guest = guestResult.rows[0];
  let providerRef = null;
  let status = 'sent';
  let errorInfo = null;

  try {
    if (channel === 'whatsapp') {
      const result = await sendWhatsAppMessage({ guest, template, payload });
      providerRef = result.providerRef;
      status = result.status || 'sent';
    } else {
      const result = await sendEmailMessage({ guest, template, payload });
      providerRef = result.providerRef;
      status = result.status || 'sent';
    }
  } catch (error) {
    logger({ level: 'error', message: 'delivery_channel_failed', channel, guest_id: guestId, error: error.message });
    errorInfo = { channel, message: error.message };
    if (channel === 'whatsapp') {
      // fallback to email
      try {
        const result = await sendEmailMessage({ guest, template, payload });
        providerRef = result.providerRef;
        status = result.status || 'sent';
      } catch (fallbackError) {
        errorInfo = { channel: 'email', message: fallbackError.message };
        await updateDeliveryLog(deliveryLogId, 'failed', providerRef, errorInfo);
        throw fallbackError;
      }
    } else {
      await updateDeliveryLog(deliveryLogId, 'failed', providerRef, errorInfo);
      throw error;
    }
  }

  await updateDeliveryLog(deliveryLogId, status, providerRef, errorInfo);
}

async function processWaWebhook(data) {
  const payload = data.payload || {};
  const contact = extractWhatsappContact(payload);
  if (!contact) {
    logger({ level: 'warn', message: 'wa_webhook_no_contact', webhook_id: data.webhookId });
    return;
  }

  const expiresAt = new Date(Date.now() + Number(env.WA_SESSION_TTL_SECONDS || 24 * 3600) * 1000);
  await query(
    `INSERT INTO wa_sessions (phone, opened_at, expires_at)
     VALUES ($1, now(), $2)
     ON CONFLICT (phone) DO UPDATE SET opened_at = EXCLUDED.opened_at, expires_at = EXCLUDED.expires_at`,
    [contact, expiresAt],
  );

  const redis = await ensureRedis({ name: 'wa-sessions', env });
  await redis.set(`wa:session:${contact}`, 'open', 'EX', Number(env.WA_SESSION_TTL_SECONDS || 24 * 3600));

  const inboundMessages = Array.isArray(payload.messages) ? payload.messages : [];
  for (const message of inboundMessages) {
    const messageId = message?.id || message?.message_id || null;
    if (messageId) {
      const dedupeTtl = Number(env.WA_INBOUND_DEDUPE_TTL_SECONDS || 3 * 24 * 3600);
      const dedupeResult = await redis.set(`wa:inbound:${messageId}`, data.webhookId, 'NX', 'EX', dedupeTtl);
      if (dedupeResult !== 'OK') {
        continue;
      }
    }
    await handleInboundMessage({ message, contact, webhook: data, env });
  }

  const statusUpdates = Array.isArray(payload.statuses) ? payload.statuses : [];
  for (const status of statusUpdates) {
    if (!status?.id) continue;
    const providerRef = status.id;
    const deliveryStatus = mapWhatsappStatus(status.status);
    if (deliveryStatus) {
      await query(
        `UPDATE delivery_logs
         SET status = $1, provider_ref = COALESCE(provider_ref, $2), updated_at = now()
         WHERE provider_ref = $2`,
        [deliveryStatus, providerRef],
      );
    }
  }
}

async function processPaymentsWebhook(data) {
  const { provider, payload } = data;
  const redis = await ensureRedis({ name: 'director-cache', env });
  if (provider === 'stripe') {
    await handleStripeWebhook(payload);
  } else if (provider === 'conekta') {
    await handleConektaWebhook(payload);
  } else {
    await handleMockWebhook(payload);
  }
  await redis.del('director:overview');
}

async function sendWhatsAppMessage({ guest, template, payload }) {
  if (!whatsappBreaker.canExecute()) {
    throw new Error('wa_circuit_open');
  }

  const apiKey = env.WA_API_TOKEN || env.WA_360DIALOG_API_KEY;
  const apiBase = env.WA_API_BASE ? env.WA_API_BASE.replace(/\/$/, '') : '';
  const apiUrl =
    env.WA_360DIALOG_API_URL ||
    (apiBase ? `${apiBase}/v1/messages` : 'https://waba.360dialog.io/v1/messages');

  if (!apiKey) {
    whatsappBreaker.success();
    logger({ level: 'warn', message: 'wa_send_simulated', guest_id: guest.id, simulated: true });
    return { providerRef: `wa-sim-${randomUUID()}`, status: 'sent' };
  }

  const body = {
    to: guest.phone,
    type: 'template',
    template: {
      name: template,
      language: { code: 'es' },
      components: Array.isArray(payload?.components) ? payload.components : [],
    },
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    whatsappBreaker.failure();
    const errorText = await response.text();
    throw new Error(`wa_send_failed_${response.status}_${errorText}`);
  }

  whatsappBreaker.success();
  const payloadResponse = await response.json().catch(() => ({}));
  const providerRef = payloadResponse.messages?.[0]?.id || `wa-${randomUUID()}`;

  const redis = await ensureRedis({ name: 'wa-sessions', env });
  await redis.set(`wa:session:${guest.phone}`, 'open', 'EX', Number(env.WA_SESSION_TTL_SECONDS || 24 * 3600));

  return { providerRef, status: 'sent' };
}

async function sendEmailMessage({ guest, template, payload }) {
  if (!emailBreaker.canExecute()) {
    throw new Error('email_circuit_open');
  }

  const apiKey = env.RESEND_API_KEY;
  const apiUrl = env.RESEND_API_URL || 'https://api.resend.com/emails';

  if (!apiKey) {
    emailBreaker.success();
    logger({ level: 'warn', message: 'email_send_simulated', guest_id: guest.id });
    return { providerRef: `email-sim-${randomUUID()}`, status: 'sent' };
  }

  const body = {
    from: env.RESEND_FROM_EMAIL || 'noreply@monotickets.dev',
    to: guest.email,
    subject: payload?.subject || `Actualización de tu evento`,
    html: payload?.html || `<p>Template ${template} enviado.</p>`,
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    emailBreaker.failure();
    const errorText = await response.text();
    throw new Error(`email_send_failed_${response.status}_${errorText}`);
  }

  emailBreaker.success();
  const payloadResponse = await response.json().catch(() => ({}));
  return { providerRef: payloadResponse.id || `email-${randomUUID()}`, status: 'sent' };
}

async function updateDeliveryLog(deliveryLogId, status, providerRef, errorInfo) {
  if (!deliveryLogId) return;
  await query(
    `UPDATE delivery_logs
     SET status = $1,
         provider_ref = COALESCE($2, provider_ref),
         error = $3::jsonb,
         updated_at = now()
     WHERE id = $4`,
    [status, providerRef, errorInfo ? JSON.stringify(errorInfo) : null, deliveryLogId],
  );
}

function extractWhatsappContact(payload) {
  if (Array.isArray(payload.contacts) && payload.contacts[0]?.wa_id) {
    return payload.contacts[0].wa_id;
  }
  if (Array.isArray(payload.messages) && payload.messages[0]?.from) {
    return payload.messages[0].from;
  }
  if (payload?.from) {
    return payload.from;
  }
  return null;
}

function mapWhatsappStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'delivered';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

async function invalidateLandingCache(eventId, env) {
  if (!eventId) return;
  const redis = await ensureRedis({ name: 'landing-cache', env });
  await redis.del(`landing:${eventId}`, `landing:dashboard:${eventId}`);
}

async function handleStripeWebhook(payload = {}) {
  const eventType = payload.type || payload.event || '';
  const object = payload.data?.object || {};
  const providerRef = object.id || payload.data?.id || null;
  const paymentId = object.metadata?.payment_id || null;
  const status = normalizeStripeStatus(object.status || eventType);

  if (!providerRef && !paymentId) {
    logger({ level: 'warn', message: 'stripe_webhook_missing_reference' });
    return;
  }

  await query(
    `UPDATE payments
     SET status = $1,
         provider_ref = COALESCE($2, provider_ref),
         confirmed_at = CASE WHEN $1 IN ('succeeded', 'confirmed') THEN now() ELSE confirmed_at END,
         updated_at = now()
     WHERE provider_ref = COALESCE($2, provider_ref)
        OR metadata ->> 'payment_id' = COALESCE($3, metadata ->> 'payment_id')`,
    [status, providerRef, paymentId],
  );
}

async function handleConektaWebhook(payload = {}) {
  const data = payload.data?.object || payload.data || {};
  const providerRef = data.id || data.reference_id || null;
  const status = normalizeConektaStatus(data.status || payload.type || 'pending');
  await query(
    `UPDATE payments
     SET status = $1,
         provider_ref = COALESCE($2, provider_ref),
         confirmed_at = CASE WHEN $1 IN ('paid', 'succeeded', 'confirmed') THEN now() ELSE confirmed_at END,
         updated_at = now()
     WHERE provider_ref = COALESCE($2, provider_ref)`,
    [status, providerRef],
  );
}

async function handleMockWebhook(payload = {}) {
  const providerRef = payload.providerRef || payload.id || null;
  if (!providerRef) return;
  await query(
    `UPDATE payments SET status = 'succeeded', provider_ref = $1, confirmed_at = now(), updated_at = now() WHERE provider_ref = $1`,
    [providerRef],
  );
}

async function handleInboundMessage({ message = {}, contact, webhook, env }) {
  const text = extractMessageText(message);
  if (!text) {
    return;
  }

  if (!/confirm/i.test(text)) {
    return;
  }

  const guestResult = await query(
    `SELECT id, status, event_id
       FROM guests
      WHERE phone = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [contact],
  );

  if (guestResult.rowCount === 0) {
    logger({ level: 'info', message: 'wa_inbound_guest_not_found', phone: contact, webhook_id: webhook.webhookId });
    return;
  }

  const guest = guestResult.rows[0];
  if (guest.status === 'pending') {
    await query(
      `UPDATE guests
          SET status = 'confirmed',
              confirmation_payload = jsonb_build_object('source', 'whatsapp', 'webhookId', $2, 'messageId', $3, 'receivedAt', $4)
        WHERE id = $1`,
      [guest.id, webhook.webhookId, message.id || null, webhook.receivedAt || new Date().toISOString()],
    );
    await invalidateLandingCache(guest.event_id, env);
    logger({ level: 'info', message: 'guest_confirmed_from_wa', guest_id: guest.id, event_id: guest.event_id });
  }
}

function extractMessageText(message = {}) {
  if (typeof message.text === 'string') return message.text;
  if (typeof message.body === 'string') return message.body;
  if (typeof message?.text?.body === 'string') return message.text.body;
  if (Array.isArray(message.messages) && message.messages[0]?.text) {
    return message.messages[0].text;
  }
  return '';
}

function normalizeStripeStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'payment_intent.succeeded':
    case 'succeeded':
      return 'succeeded';
    case 'payment_intent.processing':
    case 'processing':
      return 'processing';
    case 'payment_intent.payment_failed':
    case 'requires_payment_method':
    case 'failed':
      return 'failed';
    default:
      return status || 'pending';
  }
}

function normalizeConektaStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'paid':
    case 'succeeded':
      return 'paid';
    case 'pending':
    case 'pre_authorized':
      return 'pending';
    case 'expired':
    case 'canceled':
    case 'failed':
      return 'failed';
    default:
      return status || 'pending';
  }
}

function scheduleLandingJob() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const force = args.has('--force');

  const execute = async () => {
    try {
      await runLandingTtlJob({ env, logger, dryRun, force });
    } catch (error) {
      logger({ level: 'error', message: 'landing_ttl_job_failed', error: error.message });
    }
  };

  if (force) {
    execute();
  }

  const now = new Date();
  const hour = Number(env.LANDING_JOB_HOUR || 3);
  const minute = Number(env.LANDING_JOB_MINUTE || 0);
  const nextRun = new Date(now);
  nextRun.setHours(hour, minute, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const delay = nextRun.getTime() - now.getTime();
  setTimeout(() => {
    execute();
    setInterval(execute, 24 * 3600 * 1000).unref();
  }, delay).unref();
}

function scheduleQueueMetrics() {
  const interval = Number(env.QUEUE_METRICS_INTERVAL_MS || 30000);
  const deliveryMetrics = new SimpleQueue(deliveryQueueName, { connectionOptions: { env, logger } });
  const waMetrics = new SimpleQueue(waInboundQueueName, { connectionOptions: { env, logger } });
  const paymentsMetrics = new SimpleQueue(paymentsQueueName, { connectionOptions: { env, logger } });

  const logMetrics = async () => {
    try {
      const [delivery, wa, payments] = await Promise.all([
        buildMetrics(deliveryMetrics, deliveryQueueName),
        buildMetrics(waMetrics, waInboundQueueName),
        buildMetrics(paymentsMetrics, paymentsQueueName),
      ]);
      logger({ level: 'info', message: 'queue_metrics', delivery, wa, payments });
    } catch (error) {
      logger({ level: 'error', message: 'queue_metrics_failed', error: error.message });
    }
  };

  setInterval(logMetrics, interval).unref();
}

async function buildMetrics(queue, name) {
  return {
    name,
    waiting: await queue.countWaiting(),
    delayed: await queue.countDelayed(),
    active: await queue.countActive(),
  };
}

main().catch((error) => {
  logger({ level: 'fatal', message: 'worker_failed', error: error.message });
  process.exit(1);
});
