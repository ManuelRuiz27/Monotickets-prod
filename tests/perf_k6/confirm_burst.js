import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';

const backend = __ENV.BASE_URL_BACKEND || 'http://backend:3000';
const csvCodes = __ENV.CONFIRM_CODES_CSV || '';

const codes = new SharedArray('confirm-codes', () => {
  if (!csvCodes) {
    return ['MONO-QR-0001', 'MONO-QR-0002', 'MONO-QR-0003'];
  }
  return csvCodes
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
});

const confirmBase = `${backend}/public/confirm`;
const inviteBase = `${backend}/public/invite`;

export const options = {
  thresholds: {
    'http_req_failed{endpoint:confirm}': ['rate<0.01'],
    'http_req_duration{endpoint:confirm}': ['p(95)<400'],
  },
  scenarios: {
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 25,
      maxVUs: 120,
      stages: [
        { duration: '15s', target: 40 },
        { duration: '30s', target: 90 },
        { duration: '15s', target: 0 },
      ],
      tags: { scenario: 'burst' },
    },
    soak: {
      executor: 'constant-vus',
      vus: Number(__ENV.CONFIRM_SOAK_VUS || 20),
      duration: __ENV.CONFIRM_SOAK_DURATION || '7m',
      startTime: '1m',
      tags: { scenario: 'soak' },
    },
  },
};

function pickCode() {
  const index = exec.instance.iterationInTest % codes.length;
  return codes[index];
}

export default function main() {
  const code = pickCode();

  const confirmRes = http.post(`${confirmBase}/${code}`, JSON.stringify({
    location: __ENV.CONFIRM_LOCATION || 'main-gate',
    source: 'perf-suite',
  }), {
    headers: { 'content-type': 'application/json' },
    tags: { endpoint: 'confirm' },
  });

  check(confirmRes, {
    'confirm status acceptable': (r) => [200, 202, 409, 422, 429].includes(r.status),
  });

  const inviteRes = http.get(`${inviteBase}/${code}`, { tags: { endpoint: 'confirm' } });
  check(inviteRes, {
    'invite status ok': (r) => [200, 202, 304, 404, 409].includes(r.status),
  });

  if (confirmRes.status === 429) {
    sleep(Number(__ENV.CONFIRM_BACKOFF || 0.75));
  } else {
    sleep(0.15);
  }
}

export function handleSummary(data) {
  const summary = JSON.stringify(data, null, 2);
  const fileName = `reports/perf/confirm-${Date.now()}.json`;
  return {
    stdout: `\nConfirm burst summary saved to ${fileName}\n`,
    [fileName]: summary,
  };
}
