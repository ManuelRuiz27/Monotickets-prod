import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const backend = __ENV.BASE_URL_BACKEND || 'http://backend:3000';
const validQR = __ENV.SCAN_QR_VALID || 'MONO-QR-0001';
const duplicateQR = __ENV.SCAN_QR_DUP || 'MONO-QR-0001-DUP';
const invalidQR = __ENV.SCAN_QR_INVALID || 'NOT-A-QR';

const mix = {
  valid: Number(__ENV.SCAN_VALID_PERCENT || 60),
  duplicate: Number(__ENV.SCAN_DUP_PERCENT || 25),
  invalid: Number(__ENV.SCAN_INVALID_PERCENT || 15),
};

const total = mix.valid + mix.duplicate + mix.invalid;
if (total === 0) {
  mix.valid = 60;
  mix.duplicate = 25;
  mix.invalid = 15;
}

const endpoint = `${backend}/scan/validate`;

export const options = {
  thresholds: {
    'http_req_failed{endpoint:scan}': ['rate<0.01'],
    'http_req_duration{endpoint:scan}': ['p(95)<300'],
  },
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { duration: '10s', target: 30 },
        { duration: '45s', target: 80 },
        { duration: '10s', target: 0 },
      ],
      tags: { scenario: 'spike' },
    },
    soak: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: __ENV.SCAN_SOAK_DURATION || '6m',
      preAllocatedVUs: 20,
      maxVUs: 60,
      startTime: '1m10s',
      tags: { scenario: 'soak' },
    },
  },
};

function pickCode(seed) {
  const normalized = (seed + exec.instance.iterationInInstance) % 100;
  if (normalized < mix.valid) {
    return { code: validQR, metadata: { status: 'valid' } };
  }
  if (normalized < mix.valid + mix.duplicate) {
    return { code: duplicateQR, metadata: { status: 'duplicate' } };
  }
  return { code: invalidQR, metadata: { status: 'invalid' } };
}

export default function main() {
  const sample = pickCode(exec.instance.vu.idInTest * Date.now());
  const res = http.post(endpoint, JSON.stringify({
    code: sample.code,
    eventId: __ENV.SCAN_EVENT_ID || 'demo-event',
  }), {
    headers: { 'content-type': 'application/json' },
    tags: { endpoint: 'scan' },
  });

  check(res, {
    'status acceptable': (r) => [200, 202, 409, 422, 429].includes(r.status),
  });

  if (res.status === 429) {
    sleep(Number(__ENV.SCAN_BACKOFF || 0.5));
  } else {
    sleep(0.1);
  }
}

export function handleSummary(data) {
  const summary = JSON.stringify(data, null, 2);
  const fileName = `reports/perf/scan-${Date.now()}.json`;
  return {
    stdout: `\nScan spike summary saved to ${fileName}\n`,
    [fileName]: summary,
  };
}
