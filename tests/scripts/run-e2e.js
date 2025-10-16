#!/usr/bin/env node

/**
 * Placeholder E2E runner that validates critical HTTP flows against the running
 * stack. Se ejecuta dentro del contenedor `tests` y reemplaza la dependencia
 * externa `testsprite`, que aún no está disponible en npm.
 */

loadDotenv();

const backendCandidates = dedupe([
  process.env.BASE_URL_BACKEND,
  process.env.TEST_TARGET_API,
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://backend-api:8080',
  'http://backend:8080',
]);

const frontendCandidates = dedupe([
  process.env.BASE_URL_FRONTEND,
  process.env.TEST_TARGET_WEB,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://frontend:3000',
  'http://frontend:3001',
]);

let cachedBackendBase;
let cachedFrontendBase;

const args = process.argv.slice(2);
const selectedTags = collectTags(args);

async function main() {
  const tasks = [];
  const runAll = selectedTags.length === 0;

  if (runAll || selectedTags.includes('@health')) {
    tasks.push(runHealthSuite());
  }

  if (runAll || selectedTags.includes('@confirm') || selectedTags.includes('@guests')) {
    tasks.push(runGuestFlow({ includeCreation: runAll || selectedTags.includes('@guests') }));
  }

  if (runAll || selectedTags.includes('@scan')) {
    tasks.push(runScanFlow());
  }

  if (runAll || selectedTags.includes('@wa')) {
    tasks.push(runWhatsappWebhook());
  }

  if (tasks.length === 0) {
    tasks.push(runSmokeChecks());
  }

  const results = await Promise.allSettled(tasks);
  const failures = results.filter(({ status }) => status === 'rejected');

  if (failures.length > 0) {
    failures.forEach(({ reason }) => {
      log({ level: 'error', message: reason?.message || String(reason) });
    });
    process.exit(1);
  }

  log({ level: 'info', message: 'e2e_checks_completed', tags: selectedTags.length ? selectedTags : ['@all'] });
}

function collectTags(argv) {
  const tags = [];
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '-t' || current === '--tag') {
      const next = argv[i + 1];
      if (next) {
        tags.push(next);
        i += 1;
      }
    } else if (current.startsWith('@')) {
      tags.push(current);
    }
  }
  return [...new Set(tags)];
}

async function runSmokeChecks() {
  await Promise.all([checkBackendHealth(), checkFrontendHome()]);
  log({ level: 'info', message: 'smoke_checks_ok' });
}

async function runHealthSuite() {
  await Promise.all([checkBackendHealth(), checkFrontendHealth()]);
  log({ level: 'info', message: 'health_checks_ok' });
}

async function runGuestFlow({ includeCreation = false } = {}) {
  await runSmokeChecks();
  const backendBase = await resolveBackendBase();
  const eventId = process.env.E2E_EVENT_ID || 'demo-event';
  const url = buildUrl(backendBase, `/events/${encodeURIComponent(eventId)}/guests`);
  const response = await timedFetch(url);
  if (!response.ok) {
    throw new Error(`Guest endpoint failed with status ${response.status}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload.guests)) {
    throw new Error('Guest endpoint responded without guests array');
  }

  const baseline = payload.guests.length;
  log({ level: 'info', message: 'guest_flow_ok', event_id: eventId, guests: baseline });

  if (includeCreation) {
    await createGuest({ backendBase, eventId, baseline });
  }
}

async function createGuest({ backendBase, eventId, baseline }) {
  const payload = {
    name: `Auto Guest ${Date.now()}`,
    email: `autoguest-${Date.now()}@example.com`,
    phone: `555${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
    status: 'pending',
  };

  const createResponse = await timedFetch(buildUrl(backendBase, `/events/${encodeURIComponent(eventId)}/guests`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-source': 'e2e-runner' },
    body: JSON.stringify(payload),
  });

  const status = createResponse.status;
  if (status >= 200 && status < 300) {
    log({ level: 'info', message: 'guest_created', event_id: eventId, status });
    const followUp = await timedFetch(buildUrl(backendBase, `/events/${encodeURIComponent(eventId)}/guests`));
    if (followUp.ok) {
      const body = await followUp.json().catch(() => ({ guests: [] }));
      const total = Array.isArray(body.guests) ? body.guests.length : baseline;
      log({ level: 'info', message: 'guest_list_updated', guests: total, baseline });
    }
    return;
  }

  if (status >= 400 && status < 500) {
    const errorPayload = await createResponse.json().catch(() => ({ status }));
    log({ level: 'warn', message: 'guest_create_validation_error', status, payload: errorPayload });
    return;
  }

  throw new Error(`Guest creation returned unexpected status ${status}`);
}

async function runScanFlow() {
  await runSmokeChecks();
  const backendBase = await resolveBackendBase();
  const sample = {
    code: process.env.E2E_SAMPLE_CODE || 'MONO-123-ABC',
    eventId: process.env.E2E_EVENT_ID || 'demo-event',
  };
  const response = await timedFetch(buildUrl(backendBase, '/scan/validate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sample),
  });
  if (!response.ok) {
    throw new Error(`Scan endpoint failed with status ${response.status}`);
  }
  const payload = await response.json();
  const allowedStatuses = new Set(['valid', 'duplicate', 'invalid']);
  if (!allowedStatuses.has(payload.status)) {
    throw new Error(`Unexpected scan status: ${payload.status}`);
  }
  log({ level: 'info', message: 'scan_flow_ok', status: payload.status });
}

async function runWhatsappWebhook() {
  const backendBase = await resolveBackendBase().catch(() => null);
  const candidates = dedupe([
    process.env.WA_WEBHOOK_URL,
    backendBase ? buildUrl(backendBase, '/wa/webhook') : null,
    'http://localhost:8080/wa/webhook',
    'http://127.0.0.1:8080/wa/webhook',
    'http://backend-api:8080/wa/webhook',
    'http://backend:8080/wa/webhook',
  ]);

  if (candidates.length === 0) {
    throw new Error('WA webhook endpoint not defined');
  }

  const payload = { type: 'ping', at: new Date().toISOString() };
  let lastError;

  for (const endpoint of candidates) {
    try {
      const response = await timedFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        lastError = new Error(`WA webhook failed with status ${response.status} (${endpoint})`);
        continue;
      }
      log({ level: 'info', message: 'wa_webhook_ok', endpoint });
      return;
    } catch (error) {
      lastError = new Error(`Fetch error for ${endpoint}: ${error.message}`);
    }
  }

  throw lastError || new Error('WA webhook checks failed');
}

async function checkBackendHealth() {
  const backendBase = await resolveBackendBase();
  const response = await timedFetch(buildUrl(backendBase, '/health'));
  if (!response.ok) {
    throw new Error(`Backend health failed with status ${response.status}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!payload || payload.status !== 'ok') {
    throw new Error('Backend health payload invalid');
  }
  log({ level: 'info', message: 'backend_health_ok', env: payload.env });
}

async function checkFrontendHome() {
  const frontendBase = await resolveFrontendBase();
  const response = await timedFetch(frontendBase);
  if (!response.ok) {
    throw new Error(`Frontend home failed with status ${response.status}`);
  }
  log({ level: 'info', message: 'frontend_home_ok' });
}

async function checkFrontendHealth() {
  const frontendBase = await resolveFrontendBase();
  const response = await timedFetch(buildUrl(frontendBase, '/health'));
  if (!response.ok) {
    throw new Error(`Frontend health failed with status ${response.status}`);
  }
  log({ level: 'info', message: 'frontend_health_ok' });
}

async function resolveBackendBase() {
  if (cachedBackendBase) {
    return cachedBackendBase;
  }
  cachedBackendBase = await resolveService('backend', backendCandidates, '/health');
  log({ level: 'debug', message: 'backend_base_resolved', url: cachedBackendBase });
  return cachedBackendBase;
}

async function resolveFrontendBase() {
  if (cachedFrontendBase) {
    return cachedFrontendBase;
  }
  cachedFrontendBase = await resolveService('frontend', frontendCandidates, '/');
  log({ level: 'debug', message: 'frontend_base_resolved', url: cachedFrontendBase });
  return cachedFrontendBase;
}

async function resolveService(name, candidates, probePath) {
  const attempts = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const base = normalizeBase(candidate);
    try {
      const target = probePath ? buildUrl(base, probePath) : base;
      const response = await timedFetch(target);
      if (!response.ok) {
        attempts.push(`${base} -> status ${response.status}`);
        continue;
      }
      return base;
    } catch (error) {
      attempts.push(`${base} -> ${error.message}`);
    }
  }
  throw new Error(`Unable to resolve ${name} endpoint. Attempts: ${attempts.join('; ')}`);
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeout());
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new Error(`Fetch error for ${url}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function getTimeout() {
  const raw = parseInt(process.env.TEST_TIMEOUT || '300000', 10);
  if (Number.isNaN(raw)) {
    return 300000;
  }
  return raw;
}

function log(payload) {
  console.log(JSON.stringify(payload));
}

function normalizeBase(value) {
  return String(value).replace(/\/+$/, '');
}

function buildUrl(base, path = '') {
  if (!path) {
    return normalizeBase(base);
  }
  const sanitizedBase = normalizeBase(base);
  const sanitizedPath = String(path).replace(/^\/+/, '');
  return `${sanitizedBase}/${sanitizedPath}`;
}

function dedupe(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

function loadDotenv() {
  try {
    // Lazy require to avoid adding a dependency when already bundled
    const dotenv = require('dotenv');
    const path = require('node:path');
    const fs = require('node:fs');
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  } catch (error) {
    // Si dotenv no está disponible (por ejemplo en imagen minimal), seguimos con las variables ya presentes.
    log({
      level: 'debug',
      message: 'dotenv_unavailable_or_missing',
      error: error.message,
    });
  }
}

main().catch((error) => {
  log({ level: 'fatal', message: 'e2e_checks_failed', error: error.message });
  process.exit(1);
});
