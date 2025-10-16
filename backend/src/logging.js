import { randomUUID } from 'node:crypto';

export function createLogger(options = {}) {
  const { service = 'app', env = process.env } = options;
  const logFormat = String(env?.LOG_FORMAT || 'plain').toLowerCase();

  return (input = {}) => {
    const timestamp = input.ts || new Date().toISOString();
    const requestId = input.request_id || input.req_id || input.requestId || randomUUID();

    const sanitized = Object.fromEntries(
      Object.entries({
        timestamp,
        ts: timestamp,
        service,
        level: input.level || 'info',
        ...input,
        request_id: requestId,
        req_id: requestId,
        correlation_id: requestId,
      }).filter(([, value]) => value !== undefined && value !== null),
    );

    if (logFormat === 'json') {
      console.log(JSON.stringify(sanitized));
      return;
    }

    const { level, message, ...rest } = sanitized;
    const suffix = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
    console.log(`[${timestamp}] [${service}] ${String(level || 'info').toUpperCase()} ${message || ''}${suffix}`.trim());
  };
}
