import http from 'node:http';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import packageJson from '../package.json' assert { type: 'json' };

import {
  signAccessToken,
  signStaffToken,
  signViewerToken,
} from './auth/tokens.js';
import { runMiddlewareStack } from './http/middleware.js';
import { createJwtAuthMiddleware } from './auth/middleware.js';
import { RBAC, authorizeAction } from './auth/rbac.js';
import { createLogger } from './logging.js';
import { createQueues } from './queues/index.js';
import { createDeliveryModule } from './modules/delivery.js';
import { createDirectorModule } from './modules/director.js';
import { createPaymentsModule } from './modules/payments.js';
import { createErrorInterceptor } from './http/error-interceptor.js';
import { query } from './db/index.js';
import { ensureRedis } from './redis/client.js';
import { hitRateLimit } from './lib/rate-limit.js';

const DEFAULT_APP_ENV = 'development';
const HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const metricsRegistry = new Map();
const APP_VERSION = packageJson.version || '0.0.0';
const APP_BOOT_TIME_MS = Date.now();
const DEFAULT_GUEST_LIST_LIMIT = 50;
const RATE_LIMIT_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60);
const RATE_LIMIT_SCAN = Number(process.env.RATE_LIMIT_SCAN || 30);
const RATE_LIMIT_WEBHOOK = Number(process.env.RATE_LIMIT_WEBHOOK || 120);
const RATE_LIMIT_DELIVER_SEND = Number(process.env.RATE_LIMIT_DELIVER_SEND || 60);
const RATE_LIMIT_DELIVER_LEGACY = Number(process.env.RATE_LIMIT_DELIVER_LEGACY || 45);
const RATE_LIMIT_PAYMENTS_INTENT = Number(process.env.RATE_LIMIT_PAYMENTS_INTENT || 30);
const RATE_LIMIT_DIRECTOR_ASSIGN = Number(process.env.RATE_LIMIT_DIRECTOR_ASSIGN || 20);
const RATE_LIMIT_DIRECTOR_PAYMENTS = Number(process.env.RATE_LIMIT_DIRECTOR_PAYMENTS || 20);
const RATE_LIMIT_DIRECTOR_OVERVIEW = Number(process.env.RATE_LIMIT_DIRECTOR_OVERVIEW || 30);
const RATE_LIMIT_DIRECTOR_LEDGER = Number(process.env.RATE_LIMIT_DIRECTOR_LEDGER || 30);
const RATE_LIMIT_DIRECTOR_REPORT_OVERVIEW = Number(process.env.RATE_LIMIT_DIRECTOR_REPORT_OVERVIEW || 30);
const RATE_LIMIT_DIRECTOR_REPORT_TOP = Number(process.env.RATE_LIMIT_DIRECTOR_REPORT_TOP || 30);
const RATE_LIMIT_DIRECTOR_REPORT_DEBT = Number(process.env.RATE_LIMIT_DIRECTOR_REPORT_DEBT || 30);
const RATE_LIMIT_DIRECTOR_REPORT_USAGE = Number(process.env.RATE_LIMIT_DIRECTOR_REPORT_USAGE || 30);

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
  const middlewares = [
    createErrorInterceptor({ env, logger }),
    createJwtAuthMiddleware({ env, logger }),
  ];

  attachQueueObservers(queuesPromise, logger, env);

  return http.createServer(async (req, res) => {
    const startedAt = process.hrtime.bigint();
    let requestId = req.headers['x-request-id'] || randomUUID();
    res.setHeader('x-request-id', requestId);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method ?? 'GET';
    const requestContext = { eventId: undefined };
    const middlewareContext = {
      env,
      logger,
      requestId,
      method,
      url,
    };
    const middlewareResult = await runMiddlewareStack(middlewares, req, res, middlewareContext);
    if (middlewareResult.halted || res.writableEnded) {
      return;
    }
    if (middlewareContext.requestId && middlewareContext.requestId !== requestId) {
      requestId = middlewareContext.requestId;
      res.setHeader('x-request-id', requestId);
    }
    const auth = middlewareContext.auth || { user: null, error: 'missing_token', token: null };
    const clientFingerprint = getClientFingerprint(req);
    if (auth.user?.id) {
      requestContext.userId = auth.user.id;
    }

    try {
      if (method === 'GET' && url.pathname === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(renderMetrics());
        return;
      }

      if (method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, {
          status: 'ok',
          env: env.APP_ENV || DEFAULT_APP_ENV,
          version: APP_VERSION,
          uptimeMs: Date.now() - APP_BOOT_TIME_MS,
        });
      }

      if (method === 'POST' && url.pathname === '/deliver/send') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DELIVER_SEND,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = [
          'ratelimit',
          'deliver',
          'send',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const deliverLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DELIVER_SEND,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!deliverLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await deliveryModule.send({ body, requestId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/deliver/webhook') {
        const rateKey = `ratelimit:webhook:${clientFingerprint}`;
        const webhookLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_WEBHOOK,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!webhookLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await deliveryModule.enqueueWebhook({
          body,
          headers: req.headers,
          requestId,
        });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && /^\/deliver\/.+\/status$/.test(url.pathname)) {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DELIVER_STATUS,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }
        const deliveryId = url.pathname.split('/')[2];
        const providerRef = url.searchParams.get('provider_ref') || url.searchParams.get('providerRef') || undefined;
        const { statusCode, payload, headers } = await deliveryModule.getStatus({ deliveryId, providerRef });
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (
        method === 'POST' &&
        /^\/events\/[^/]+\/guests\/[^/]+\/send$/.test(url.pathname)
      ) {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DELIVER_LEGACY_SEND,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }
        const [, , eventId, , guestId] = url.pathname.split('/');
        requestContext.eventId = eventId;

        const rateKey = [
          'ratelimit',
          'deliver',
          'legacy',
          auth.user?.id || 'anonymous',
          eventId || 'unknown',
          clientFingerprint,
        ].join(':');
        const legacyLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DELIVER_LEGACY,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!legacyLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

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
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_OVERVIEW,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }
        const overviewRateKey = [
          'ratelimit',
          'director',
          'overview',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const overviewLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: overviewRateKey,
          limit: RATE_LIMIT_DIRECTOR_OVERVIEW,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!overviewLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const { statusCode, payload, headers } = await directorModule.getOverview();
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && url.pathname === '/director/reports/overview') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_REPORTS_OVERVIEW,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = [
          'ratelimit',
          'director',
          'reports',
          'overview',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const reportLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DIRECTOR_REPORT_OVERVIEW,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!reportLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const filters = Object.fromEntries(url.searchParams.entries());
        const { statusCode, payload, headers } = await directorModule.getOverviewReport({ filters });
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/director/assign') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_ASSIGN,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }
        const rateKey = [
          'ratelimit',
          'director',
          'assign',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const assignLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DIRECTOR_ASSIGN,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!assignLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const body = await readJsonBody(req, logger);
        const { statusCode, payload } = await directorModule.assignTickets({ body, requestId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && url.pathname === '/director/reports/top-organizers') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_REPORTS_TOP,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = [
          'ratelimit',
          'director',
          'reports',
          'top',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const topLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DIRECTOR_REPORT_TOP,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!topLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const filters = Object.fromEntries(url.searchParams.entries());
        const { statusCode, payload, headers } = await directorModule.getTopOrganizersReport({ filters });
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && url.pathname === '/director/reports/debt-aging') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_REPORTS_DEBT,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = [
          'ratelimit',
          'director',
          'reports',
          'debt',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const debtLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DIRECTOR_REPORT_DEBT,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!debtLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const filters = Object.fromEntries(url.searchParams.entries());
        const { statusCode, payload, headers } = await directorModule.getDebtAgingReport({ filters });
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && url.pathname === '/director/reports/tickets-usage') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_REPORTS_USAGE,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = [
          'ratelimit',
          'director',
          'reports',
          'usage',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const usageLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DIRECTOR_REPORT_USAGE,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!usageLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const filters = Object.fromEntries(url.searchParams.entries());
        const { statusCode, payload, headers } = await directorModule.getTicketsUsageReport({ filters });
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'GET' && /^\/director\/organizers\/.+\/ledger$/.test(url.pathname)) {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_LEDGER,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }
        const organizerId = url.pathname.split('/')[3];

        const ledgerRateKey = [
          'ratelimit',
          'director',
          'ledger',
          auth.user?.id || 'anonymous',
          organizerId || 'unknown',
          clientFingerprint,
        ].join(':');
        const ledgerLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: ledgerRateKey,
          limit: RATE_LIMIT_DIRECTOR_LEDGER,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!ledgerLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const { statusCode, payload } = await directorModule.getOrganizerLedger({ organizerId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/director/payments') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_PAYMENTS,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = [
          'ratelimit',
          'director',
          'payments',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const directorPaymentsLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_DIRECTOR_PAYMENTS,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!directorPaymentsLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const directorBody = await readJsonBody(req, logger);
        const { statusCode, payload } = await directorModule.recordPayment({ body: directorBody, requestId });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/director/webhook') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.DIRECTOR_WEBHOOK,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const body = await readJsonBody(req, logger);
        const headers = Object.fromEntries(Object.entries(req.headers || {}));
        const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(body || {});
        const { statusCode, payload } = await directorModule.handleWebhook({
          body,
          headers,
          rawBody,
          requestId,
        });
        return sendJson(res, statusCode, { ...payload, requestId });
      }

      if (method === 'POST' && url.pathname === '/payments/intent') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.PAYMENTS_CREATE_INTENT,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = [
          'ratelimit',
          'payments',
          'intent',
          auth.user?.id || 'anonymous',
          clientFingerprint,
        ].join(':');
        const paymentsLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_PAYMENTS_INTENT,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!paymentsLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

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

      if (method === 'GET' && url.pathname === '/guests') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.GUESTS_LIST,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }
        const eventIdParam = url.searchParams.get('eventId');
        const { eventExists, guests } = await fetchGuests({
          eventId: eventIdParam ?? undefined,
          limit: DEFAULT_GUEST_LIST_LIMIT,
        });
        if (eventIdParam && !eventExists) {
          return sendJson(res, 404, { error: 'event_not_found', requestId });
        }
        return sendJson(res, 200, { guests });
      }

      if (
        method === 'GET' &&
        url.pathname.startsWith('/events/') &&
        url.pathname.endsWith('/guests')
      ) {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.EVENT_GUESTS_LIST,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }
        const [, , eventId] = url.pathname.split('/');
        const { eventExists, guests } = await fetchGuests({ eventId, limit: DEFAULT_GUEST_LIST_LIMIT });
        if (!eventExists) {
          return sendJson(res, 404, { error: 'event_not_found', requestId });
        }
        return sendJson(res, 200, { eventId, guests });
      }

      if (method === 'POST' && url.pathname === '/scan/validate') {
        if (!requireAction({
          auth,
          action: RBAC.ACTIONS.SCAN_VALIDATE,
          res,
          requestId,
          logger,
          path: url.pathname,
        })) {
          return;
        }

        const rateKey = `ratelimit:scan:${clientFingerprint}:${auth.user?.id ?? 'anonymous'}`;
        const scanLimit = await enforceRateLimit({
          env,
          logger,
          res,
          key: rateKey,
          limit: RATE_LIMIT_SCAN,
          windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
          requestId,
          path: url.pathname,
        });

        if (!scanLimit.allowed) {
          return sendJson(res, 429, { error: 'rate_limit_exceeded', requestId });
        }

        const body = await readJsonBody(req, logger);
        const code = typeof body.code === 'string' ? body.code.trim() : '';
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
        requestContext.eventId = eventId || undefined;

        if (!code || !eventId) {
          return sendJson(res, 400, { error: 'code_and_event_required', requestId });
        }

        const redis = await ensureRedis({ name: 'scan-locks', env, logger });
        const idempotencyKey = getIdempotencyKey(req.headers);
        let idempotencyCacheKey;

        if (idempotencyKey) {
          idempotencyCacheKey = `scan:idempotency:${eventId}:${idempotencyKey}`;
          const cachedRaw = await redis.get(idempotencyCacheKey);
          if (cachedRaw) {
            try {
              const cachedResponse = JSON.parse(cachedRaw);
              if (cachedResponse.body?.requestId) {
                requestId = cachedResponse.body.requestId;
                res.setHeader('x-request-id', requestId);
              }
              return sendJson(res, cachedResponse.statusCode ?? 200, cachedResponse.body);
            } catch (error) {
              log({ level: 'warn', message: 'idempotency_cache_corrupt', error: error.message }, { logger });
              await redis.del(idempotencyCacheKey);
            }
          }
        }

        const lockToken = randomUUID();
        const lockKey = `scan:lock:${eventId}:${code}`;
        const lockTtlMs = Number(env.SCAN_LOCK_TTL_MS || 1500);
        const lockResult = await redis.set(lockKey, lockToken, 'NX', 'PX', lockTtlMs);
        if (lockResult !== 'OK') {
          const responseBody = { status: 'in_progress', requestId };
          if (idempotencyCacheKey) {
            await cacheIdempotentResponse({
              redis,
              key: idempotencyCacheKey,
              statusCode: 409,
              body: responseBody,
              env,
              logger,
            });
          }
          return sendJson(res, 409, responseBody);
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
            const responseBody = { error: 'invite_not_found', status: 'invalid', requestId };
            if (idempotencyCacheKey) {
              await cacheIdempotentResponse({
                redis,
                key: idempotencyCacheKey,
                statusCode: 404,
                body: responseBody,
                env,
                logger,
              });
            }
            return sendJson(res, 404, responseBody);
          }

          const invite = inviteResult.rows[0];
          if (!['confirmed', 'scanned'].includes(invite.status)) {
            await appendScanLog({ eventId, guestId: invite.guest_id, result: 'invalid', device: body.device });
            const responseBody = { error: 'guest_not_confirmed', status: 'invalid', requestId };
            if (idempotencyCacheKey) {
              await cacheIdempotentResponse({
                redis,
                key: idempotencyCacheKey,
                statusCode: 409,
                body: responseBody,
                env,
                logger,
              });
            }
            return sendJson(res, 409, responseBody);
          }

          if (invite.status === 'scanned') {
            await appendScanLog({ eventId, guestId: invite.guest_id, result: 'duplicate', device: body.device });
            const responseBody = { status: 'duplicate', duplicate: true, requestId };
            if (idempotencyCacheKey) {
              await cacheIdempotentResponse({
                redis,
                key: idempotencyCacheKey,
                statusCode: 200,
                body: responseBody,
                env,
                logger,
              });
            }
            return sendJson(res, 200, responseBody);
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

          const responseBody =
            finalStatus === 'valid'
              ? { status: 'valid', requestId }
              : { status: 'duplicate', duplicate: true, requestId };

          if (idempotencyCacheKey) {
            await cacheIdempotentResponse({
              redis,
              key: idempotencyCacheKey,
              statusCode: 200,
              body: responseBody,
              env,
              logger,
            });
          }

          return sendJson(res, 200, responseBody);
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
      const handleError = middlewareContext.handleError;
      if (typeof handleError === 'function') {
        handleError(error, { statusCode: 500, code: 'internal_error' });
      } else {
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
      }
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
          route: url.pathname,
          status: res.statusCode,
          request_id: requestId,
          latency_ms: Number(latencyMs.toFixed(3)),
          event_id: requestContext.eventId,
          user_role: auth.user?.role,
          user_id: auth.user?.id,
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
        { name: 'whatsapp', events: queues.whatsappEvents, queue: queues.whatsappQueue },
        { name: 'email', events: queues.emailEvents, queue: queues.emailQueue },
        { name: 'pdf', events: queues.pdfEvents, queue: queues.pdfQueue },
        { name: 'deliveryFailed', events: queues.deliveryFailedEvents, queue: queues.deliveryFailedQueue },
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
              request_id: job?.requestId,
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
              request_id: job?.requestId,
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
  req.rawBody = raw;
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

async function fetchGuests({ eventId, limit = DEFAULT_GUEST_LIST_LIMIT }) {
  let eventExists = true;
  if (eventId) {
    const eventResult = await query('SELECT id FROM events WHERE id = $1 LIMIT 1', [eventId]);
    if (eventResult.rowCount === 0) {
      eventExists = false;
      return { eventExists, guests: [] };
    }
  }

  const params = [];
  let sql = `
    SELECT id, event_id, name, phone, status, created_at
      FROM guests
  `;

  if (eventId) {
    params.push(eventId);
    sql += ' WHERE event_id = $1';
  }

  sql += ' ORDER BY created_at DESC';

  if (!eventId) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }

  const result = await query(sql, params);
  const guests = result.rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    checkedIn: row.status === 'scanned',
  }));

  return { eventExists, guests };
}

function getIdempotencyKey(headers = {}) {
  const raw = headers['idempotency-key'] || headers['x-idempotency-key'];
  if (!raw) return '';
  if (Array.isArray(raw)) {
    return typeof raw[0] === 'string' ? raw[0].trim() : '';
  }
  return typeof raw === 'string' ? raw.trim() : '';
}

async function cacheIdempotentResponse({ redis, key, statusCode, body, env, logger }) {
  if (!key) return;
  const ttl = Number(env.SCAN_IDEMPOTENCY_TTL_MS || 10 * 60 * 1000);
  try {
    await redis.set(key, JSON.stringify({ statusCode, body }), 'PX', ttl);
  } catch (error) {
    log(
      { level: 'warn', message: 'idempotency_cache_write_failed', error: error.message },
      { logger },
    );
  }
}

function getClientFingerprint(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function enforceRateLimit({ env, logger, res, key, limit, windowSeconds, requestId, path }) {
  const result = await hitRateLimit({ env, logger, key, limit, windowSeconds });

  if (res) {
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Window', String(windowSeconds));
    if (!result.allowed && result.retryAfterSeconds) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
    }
  }

  if (!result.allowed) {
    log(
      {
        level: 'warn',
        message: 'rate_limit_exceeded',
        key,
        path,
        request_id: requestId,
        remaining: result.remaining,
        limit,
        window_seconds: windowSeconds,
        retry_after_seconds: result.retryAfterSeconds,
      },
      { logger },
    );
  }
  return result;
}

function requireAction({ auth, action, res, requestId, logger, path }) {
  const decision = authorizeAction({ auth, action });
  if (decision.allowed) {
    return true;
  }

  const status = decision.status ?? 403;
  const reason = decision.reason || 'forbidden';
  const error = status >= 500 ? 'authorization_error' : reason;

  log(
    {
      level: status >= 500 ? 'error' : 'warn',
      message: 'authorization_denied',
      reason,
      path,
      request_id: requestId,
      user_role: auth.user?.role,
      action,
      allowed_roles: decision.allowedRoles,
    },
    { logger },
  );

  sendJson(res, status, { error, requestId });
  return false;
}

export const internals = {
  readBody,
  readJsonBody,
  sendJson,
  waitForPort,
  delay,
  getClientFingerprint,
};
