import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const backendBase = (__ENV.BASE_URL_BACKEND || 'http://backend:3000').replace(/\/$/, '');
const endpoint = `${backendBase}/scan/validate`;
const eventId = __ENV.SCAN_EVENT_ID || 'demo-event';
const staffToken = (__ENV.STAFF_TOKEN || '').trim();
const location = __ENV.STAFF_LOCATION || 'perf-gate';

const validCodes = parseCsv(__ENV.SCAN_QR_VALID, ['MONO-QR-0001']);
const duplicateCodes = parseCsv(__ENV.SCAN_QR_DUP, ['MONO-QR-0001-DUP']);
const invalidCodes = parseCsv(__ENV.SCAN_QR_INVALID, ['NOT-A-QR']);

const mix = normalizeMix({
  valid: toNumber(__ENV.SCAN_VALID_PERCENT, 60),
  duplicate: toNumber(__ENV.SCAN_DUP_PERCENT, 25),
  invalid: toNumber(__ENV.SCAN_INVALID_PERCENT, 15),
});

const rate = Math.max(1, Math.floor(toNumber(__ENV.RPS, 50)));
const duration = __ENV.DURATION || '30s';
const preAllocatedVUs = Math.max(1, Math.ceil(rate * 1.2));
const maxVUs = Math.max(preAllocatedVUs, rate * 2);

export const options = {
  scenarios: {
    steady: {
      executor: 'constant-arrival-rate',
      rate,
      duration,
      timeUnit: '1s',
      preAllocatedVUs,
      maxVUs,
      tags: { scenario: 'steady_50rps' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<=300'],
  },
};

function parseCsv(source, fallback) {
  if (!source) return fallback;
  const values = String(source)
    .split(/[;,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMix({ valid, duplicate, invalid }) {
  const total = valid + duplicate + invalid;
  if (total === 0) {
    return { valid: 60, duplicate: 25, invalid: 15 };
  }
  return {
    valid: (valid / total) * 100,
    duplicate: (duplicate / total) * 100,
    invalid: (invalid / total) * 100,
  };
}

function pickScenario(seed) {
  const normalized = seed % 100;
  if (normalized < mix.valid) {
    return 'valid';
  }
  if (normalized < mix.valid + mix.duplicate) {
    return 'duplicate';
  }
  return 'invalid';
}

function pickCode(type) {
  const pool =
    type === 'valid' ? validCodes : type === 'duplicate' ? duplicateCodes : invalidCodes;
  const index = exec.instance.iterationInInstance % pool.length;
  return pool[index];
}

export default function scanBurst() {
  const seed = (Date.now() + exec.instance.iterationInInstance + exec.scenario.iterationInTest) % 10_000;
  const scenario = pickScenario(seed);
  const code = pickCode(scenario);
  const headers = { 'content-type': 'application/json', 'x-request-source': 'k6-perf' };
  if (staffToken) {
    headers.Authorization = `Bearer ${staffToken}`;
  }

  const payload = {
    code,
    eventId,
    device: `perf-${scenario}`,
    location,
    staffToken: staffToken || undefined,
    metadata: {
      origin: 'k6',
      scenario,
      iteration: exec.scenario.iterationInTest,
      issuedAt: new Date().toISOString(),
    },
  };

  const response = http.post(endpoint, JSON.stringify(payload), {
    tags: { endpoint: 'scan_validate', scenario },
    headers,
  });

  check(response, {
    'status acceptable': (res) => [200, 202, 409, 422, 429, 404].includes(res.status),
  });
}

export function handleSummary(data) {
  const fileName = 'reports/perf/scan_50x30.json';
  return {
    stdout: `\nscan/validate 50rps summary saved to ${fileName}\n`,
    [fileName]: JSON.stringify(data, null, 2),
  };
}
