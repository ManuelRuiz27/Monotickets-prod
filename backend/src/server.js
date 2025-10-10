import http from 'node:http';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

import {
  signAccessToken,
  signStaffToken,
  signViewerToken,
} from './auth/tokens.js';
import { createLogger } from './logging.js';

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
        const { code = '', eventId = '' } = body;
        requestContext.eventId = eventId || undefined;
        const hash = Array.from(`${code}:${eventId}`).reduce(
          (acc, char) => acc + char.charCodeAt(0),
          0,
        );
        const statuses = ['valid', 'duplicate', 'invalid'];
        const status = statuses[hash % statuses.length];
        return sendJson(res, 200, { status, requestId });
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

      if (method === 'POST' && url.pathname === '/wa/webhook') {
        await readBody(req); // discard payload
        return sendJson(res, 200, { status: 'accepted' });
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
