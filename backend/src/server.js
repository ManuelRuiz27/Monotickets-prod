import http from 'node:http';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

import {
  signAccessToken,
  signStaffToken,
  signViewerToken,
} from './auth/tokens.js';
import { createLogger } from './logging.js';
import { createQueues } from './queues/index.js';
import { createDeliveryModule } from './modules/delivery.js';
import { createDirectorModule } from './modules/director.js';
import { createPaymentsModule } from './modules/payments.js';
import { query } from './db/index.js';
import { ensureRedis } from './redis/client.js';

const DEFAULT_APP_ENV = 'development';
const HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const metricsRegistry = new Map();

function observeHttpDuration({ method, path, status, durationMs }) {
  const key = `${method.toUpperCase()}::${status}::${path}`;
  if (!metricsRegistry.has(key)) {
    metricsRegistry.set(key, {
      count: 0,
      sum: 0,
      buckets: new Array(HISTOGRAM_BUCKETS.length + 1).fill(0),
    });
  }

  const metric = metricsRegistry.get(key);
  metric.count += 1;
  metric.sum += durationMs;

  const bucketIndex = HISTOGRAM_BUCKETS.findIndex((boundary) => durationMs <= boundary);
  if (bucketIndex === -1) {
    metric.buckets[HISTOGRAM_BUCKETS.length] += 1;
  } else {
    metric.buckets[bucketIndex] += 1;
  }
}

function renderMetrics() {
  const lines = [
    '# HELP http_request_duration_ms HTTP request duration in milliseconds.',
    '# TYPE http_request_duration_ms histogram',
  ];

  for (const [key, metric] of metricsRegistry.entries()) {
    const [method, status, path] = key.split('::');
    let cumulative = 0;
    HISTOGRAM_BUCKETS.forEach((boundary, index) => {
      cumulative += metric.buckets[index];
      lines.push(
        `http_request_duration_ms_bucket{le="${boundary}",method="${method}",path="${path}",status="${status}"} ${cumulative}`,
      );
    });
    cumulative += metric.buckets[HISTOGRAM_BUCKETS.length];
    lines.push(
      `http_request_duration_ms_bucket{le="+Inf",method="${method}",path="${path}",status="${status}"} ${cumulative}`,
    );
    lines.push(`http_request_duration_ms_sum{method="${method}",path="${path}",status="${status}"} ${metric.sum}`);
    lines.push(`http_request_duration_ms_count{method="${method}",path="${path}",status="${status}"} ${metric.count}`);
  }

  return `${lines.join('\n')}\n`;
}

export function createServer(options = {}) {
  const { env = process.env } = options;
  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'backend-api' });
  const queuesPromise = createQueues({ env, logger }).catch((error) => {
    log({ level: 'error', message: 'queue_initialization_failed', error: error.message }, { logger });
    throw error;
  });
  const deliveryModule = createDeliveryModule({ env, logger, queuesPromise });
  const directorModule = createDirectorModule({ env, logger });
  const paymentsModule = createPaymentsModule({ env, logger, queuesPromise });

  attachQueueObservers(queuesPromise, logger, env);

  return http.createServer(async (req, res) => {
    const startedAt = process.hrtime.bigint();
    const requestId = req.headers['x-request-id'] || randomUUID();
    res.setHeader('x-request-id', requestId);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method ?? 'GET';
    const requestContext = { eventId: undefined };

    try {
      if (method === 'GET' && url.pathname === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(renderMetrics());
        return;
      }

      if (method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { status: 'ok', env: env.APP_ENV || DEFAULT_APP_ENV });
      }

      if (method === 'POST' && url.pathname === '/deliver/send') {
        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await deliveryModule.send({ body, requestId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/deliver/webhook') {
        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await deliveryModule.enqueueWebhook({
          body,
          requestId,
        });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && /^\/deliver\/.+\/status$/.test(url.pathname)) {
        const deliveryId = url.pathname.split('/')[2];
        const { statusCode, payload } = await deliveryModule.getStatus({ deliveryId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (
        method === 'POST' &&
        /^\/events\/[^/]+\/guests\/[^/]+\/send$/.test(url.pathname)
      ) {
        const [, , eventId, , guestId] = url.pathname.split('/');
        requestContext.eventId = eventId;
        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await deliveryModule.enqueueLegacySend({
          eventId,
          guestId,
          body,
          requestId,
        });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && url.pathname.startsWith('/wa/session/')) {
        const phone = url.pathname.split('/').at(-1);
        const { statusCode, payload } = await deliveryModule.getSession({ phone });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && url.pathname === '/director/overview') {
        const { statusCode, payload, headers } = await directorModule.getOverview();
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/director/assign') {
        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await directorModule.assignTickets({ body, requestId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && /^\/director\/organizers\/.+\/ledger$/.test(url.pathname)) {
        const organizerId = url.pathname.split('/')[3];
        const { statusCode, payload } = await directorModule.getOrganizerLedger({ organizerId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/director/payments') {
        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await directorModule.recordPayment({ body, requestId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/payments/intent') {
        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await paymentsModule.createIntent({ body, requestId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/payments/webhook') {
        const body = await readJsonBody(req, logger);
        const headers = Object.fromEntries(Object.entries(req.headers || {}));
        const { statusCode, payload } = await paymentsModule.enqueueWebhook({
          body,
          headers,
          requestId,
        });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (
        method === 'GET' &&
        url.pathname.startsWith('/events/') &&
        url.pathname.endsWith('/guests')
      ) {
        const [, , eventId] = url.pathname.split('/');
        return sendJson(res, 200, {
          eventId,
          guests: [
            { id: 'guest-1', name: 'Ada Lovelace', checkedIn: true },
            { id: 'guest-2', name: 'Grace Hopper', checkedIn: false },
          ],
        });
      }

      if (method === 'POST' && url.pathname === '/scan/validate') {
        const body = await readJsonBody(req, logger);
        const code = typeof body.code === 'string' ? body.code.trim() : '';
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
        requestContext.eventId = eventId || undefined;

        if (!code || !eventId) {
          return sendJson(res, 400, { error: 'code_and_event_required', requestId });
        }

        const lockToken = randomUUID();
        const redis = await ensureRedis({ name: 'scan-locks', env });
        const lockKey = `scan:lock:${eventId}:${code}`;
        const lockTtlMs = Number(env.SCAN_LOCK_TTL_MS || 1500);
        const lockResult = await redis.set(lockKey, lockToken, 'NX', 'PX', lockTtlMs);
        if (lockResult !== 'OK') {
          return sendJson(res, 409, { status: 'in_progress', requestId });
        }

        try {
          const inviteResult = await query(
            `SELECT invites.id AS invite_id, invites.guest_id, guests.status, guests.event_id
               FROM invites
               JOIN guests ON guests.id = invites.guest_id
              WHERE invites.code = $1 AND invites.event_id = $2
              LIMIT 1`,
            [code, eventId],
          );

          if (inviteResult.rowCount === 0) {
            await appendScanLog({ eventId, guestId: null, result: 'invalid', device: body.device });
            return sendJson(res, 200, { status: 'invalid', requestId });
          }

          const invite = inviteResult.rows[0];
          if (!['confirmed', 'scanned'].includes(invite.status)) {
            await appendScanLog({ eventId, guestId: invite.guest_id, result: 'invalid', device: body.device });
            return sendJson(res, 200, { status: 'invalid', reason: 'not_confirmed', requestId });
          }

          if (invite.status === 'scanned') {
            await appendScanLog({ eventId, guestId: invite.guest_id, result: 'duplicate', device: body.device });
            return sendJson(res, 200, { status: 'duplicate', requestId });
          }

          const updateResult = await query(
            `UPDATE guests
                SET status = 'scanned'
              WHERE id = $1 AND status = 'confirmed'
              RETURNING id`,
            [invite.guest_id],
          );

          const finalStatus = updateResult.rowCount > 0 ? 'valid' : 'duplicate';
          await appendScanLog({ eventId, guestId: invite.guest_id, result: finalStatus === 'valid' ? 'valid' : 'duplicate', device: body.device });

          return sendJson(res, 200, { status: finalStatus, requestId });
        } finally {
          const current = await redis.get(lockKey);
          if (current === lockToken) {
            await redis.del(lockKey);
          }
        }
      }

      if (method === 'POST' && url.pathname === '/auth/login') {
        const body = await readJsonBody(req, logger);
        const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
        const role = typeof body.role === 'string' ? body.role.trim() : 'viewer';

        if (!userId) {
          return sendJson(res, 400, { error: 'user_id_required', requestId });
        }

        try {
          const tokens = createLoginTokens({ userId, role, env });
          return sendJson(res, 200, { ...tokens, requestId });
        } catch (error) {
          log(
            {
              level: 'error',
              message: 'login_failed',
              error: error.message,
              request_id: requestId,
            },
            { logger },
          );
          return sendJson(res, 500, { error: 'token_generation_failed', requestId });
        }
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      sendJson(res, 500, { error: 'internal_error' });
      log(
        {
          level: 'error',
          message: 'request_failed',
          error: error.message,
          request_id: requestId,
          path: url.pathname,
          event_id: requestContext.eventId,
        },
        { logger },
      );
    } finally {
      const finishedAt = process.hrtime.bigint();
      const latencyMs = Number(finishedAt - startedAt) / 1_000_000;
      observeHttpDuration({
        method,
        path: url.pathname,
        status: String(res.statusCode),
        durationMs: latencyMs,
      });

      log(
        {
          level: 'info',
          message: 'request_completed',
          method,
          path: url.pathname,
          status: res.statusCode,
          request_id: requestId,
          latency_ms: Number(latencyMs.toFixed(3)),
          event_id: requestContext.eventId,
        },
        { logger },
      );
    }
  });
}

function attachQueueObservers(queuesPromise, logger, env) {
  queuesPromise
    .then((queues) => {
      const watchers = [
        { name: 'delivery', events: queues.deliveryEvents, queue: queues.deliveryQueue },
        { name: 'waInbound', events: queues.waInboundEvents, queue: queues.waInboundQueue },
        { name: 'payments', events: queues.paymentsEvents, queue: queues.paymentsQueue },
      ];

      watchers.forEach(({ name, events }) => {
        if (!events) return;
        events.on('failed', ({ jobId, job }) => {
          log(
            {
              level: 'warn',
              message: 'queue_job_failed',
              queue: name,
              job_id: jobId,
              delivery_log_id: job?.deliveryLogId,
            },
            { logger },
          );
        });
        events.on('dead-letter', ({ jobId, job }) => {
          log(
            {
              level: 'error',
              message: 'queue_job_dead_letter',
              queue: name,
              job_id: jobId,
              delivery_log_id: job?.deliveryLogId,
            },
            { logger },
          );
        });
      });

      const interval = Number(env.QUEUE_METRICS_INTERVAL_MS || 30000);
      const emitMetrics = async () => {
        try {
          const snapshot = await Promise.all(
            watchers.map(async ({ name, queue }) => ({
              name,
              waiting: await queue.countWaiting(),
              delayed: await queue.countDelayed(),
              active: await queue.countActive(),
            })),
          );
          log({ level: 'info', message: 'queue_metrics_snapshot', queues: snapshot }, { logger });
        } catch (error) {
          log({ level: 'error', message: 'queue_metrics_error', error: error.message }, { logger });
        }
      };

      setInterval(emitMetrics, interval).unref();
    })
    .catch((error) => {
      log({ level: 'error', message: 'queue_observer_failed', error: error.message }, { logger });
    });
}

export function createLoginTokens({ userId, role, env = process.env }) {
  const payload = { sub: userId, role };
  const tokens = {
    accessToken: signAccessToken(payload, { env }),
  };

  if (role === 'staff' || role === 'admin') {
    tokens.staffToken = signStaffToken(payload, { env });
  }

  if (role === 'viewer') {
    tokens.viewerToken = signViewerToken(payload, { env });
  }

  return tokens;
}

export async function ensureDependencies(options = {}) {
  const { env = process.env } = options;
  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'backend-api' });
  const dbHost = env.DB_HOST || 'database';
  const dbPort = Number(env.DB_PORT || 5432);
  const redisHost = new URL(env.REDIS_URL || 'redis://redis:6379');
  const retries = Number(env.STARTUP_RETRIES || 10);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await Promise.all([
        waitForPort(dbHost, dbPort),
        waitForPort(redisHost.hostname, Number(redisHost.port || 6379)),
      ]);
      log({ level: 'info', message: 'dependencies_ready', attempt }, { logger });
      return;
    } catch (error) {
      log(
        { level: 'warn', message: 'dependency_check_failed', attempt, error: error.message },
        { logger },
      );
      if (attempt === retries) {
        throw error;
      }
      await delay(2000);
    }
  }
}

const defaultLogger = createLogger({ env: process.env, service: process.env.SERVICE_NAME || 'backend-api' });

export function log(payload, { logger = defaultLogger } = {}) {
  logger(payload);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function appendScanLog({ eventId, guestId, result, device }) {
  if (!eventId || !guestId) {
    return;
  }
  const devicePayload = sanitizeDevice(device);
  await query(
    `INSERT INTO scan_logs (event_id, guest_id, result, device)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [eventId, guestId, result, devicePayload],
  );
}

function sanitizeDevice(device) {
  if (!device || typeof device !== 'object') {
    return null;
  }
  try {
    return JSON.stringify(device);
  } catch (error) {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req, logger = defaultLogger) {
  if (!req.headers['content-type']?.includes('application/json')) {
    return {};
  }
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    log({ level: 'warn', message: 'invalid_json', error: error.message }, { logger });
    return {};
  }
}

function waitForPort(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve();
    });
    socket.on('error', (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const internals = {
  readBody,
  readJsonBody,
  sendJson,
  waitForPort,
  delay,
};
