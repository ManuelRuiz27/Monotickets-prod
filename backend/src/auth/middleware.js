import { authenticateRequest } from './authorization.js';

export function createJwtAuthMiddleware({ env = process.env } = {}) {
  return async function jwtAuthMiddleware(req, res, context) {
    const auth = authenticateRequest({ headers: req.headers, env });
    context.auth = auth;
    if (!context.requestId) {
      context.requestId = res.getHeader('x-request-id');
    }
  };
}
