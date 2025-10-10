import { randomUUID } from 'node:crypto';

function toPlainString(payload) {
  const { level = 'info', message = '', ts, service, ...rest } = payload;
  const ordered = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
  const timestamp = ts || new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${service ?? 'app'}] ${message}${
    ordered ? ` ${ordered}` : ''
  }`;
}

export function createLogger(options = {}) {
  const { env = process.env, service = 'app' } = options;
  const format = (env.LOG_FORMAT || '').toLowerCase();

  return (input = {}) => {
    const ts = input.ts || new Date().toISOString();
    const requestId = input.request_id || input.req_id || input.requestId;
    const payload = {
      ts,
      service,
      ...input,
      request_id: requestId,
      req_id: requestId,
    };

    if (!payload.request_id) {
      const generated = randomUUID();
      payload.request_id = generated;
      payload.req_id = generated;
    }

    if (format === 'json') {
      const sanitized = Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== undefined),
      );
      console.log(JSON.stringify(sanitized));
      return;
    }

    console.log(toPlainString(payload));
  };
}
