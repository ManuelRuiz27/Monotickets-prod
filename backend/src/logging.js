import { randomUUID } from 'node:crypto';

export function createLogger(options = {}) {
  const { service = 'app' } = options;

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

    console.log(JSON.stringify(sanitized));
  };
}
