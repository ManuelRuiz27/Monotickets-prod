export function createErrorInterceptor(options = {}) {
  const { logger, env = process.env } = options;
  const log =
    logger ||
    ((payload) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ service: env.SERVICE_NAME || 'backend-api', ...payload }));
    });

  return async function errorInterceptor(req, res, context = {}) {
    const state = { handled: false };
    context.handleError = (error, details = {}) => {
      if (state.handled && res.writableEnded) {
        return { handled: true };
      }
      state.handled = true;

      const statusCode = Number(details.statusCode ?? 500);
      const code = typeof details.code === 'string' ? details.code : statusCode >= 500 ? 'internal_error' : 'request_error';
      const message =
        typeof details.message === 'string'
          ? details.message
          : statusCode >= 500
          ? 'Internal server error'
          : error?.message || 'Request error';
      const payload = {
        error: code,
        message,
        requestId: context.requestId,
      };
      if (details.details !== undefined) {
        payload.details = details.details;
      }

      if (!res.writableEnded) {
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
      }

      log({
        level: statusCode >= 500 ? 'error' : 'warn',
        message: 'http_error',
        request_id: context.requestId,
        path: context.url?.pathname,
        status: statusCode,
        error: error?.message,
        code,
      });

      context.terminated = true;
      return payload;
    };
  };
}
