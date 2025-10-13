import { decodeJwt, getJwtSecret, verifyJwt } from './tokens.js';
import { getJwtClaims } from '../config/jwt.js';

export function authenticateRequest({ headers = {}, env = process.env } = {}) {
  const authHeader = headers.authorization || headers.Authorization;

  if (!authHeader) {
    return { user: null, error: 'missing_token', token: null };
  }

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return { user: null, error: 'invalid_authorization_format', token: null };
  }

  try {
    const secret = getJwtSecret(env);
    if (!verifyJwt(token, secret)) {
      throw new Error('invalid_signature');
    }

    const { payload } = decodeJwt(token);
    const claims = getJwtClaims(env);
    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp < now) {
      throw new Error('token_expired');
    }

    if (payload.iss !== claims.issuer || payload.aud !== claims.audience) {
      throw new Error('invalid_claims');
    }

    const role = payload.role || 'viewer';
    const userId = payload.sub || null;

    return {
      user: {
        id: userId,
        role,
        tokenType: payload.tokenType || 'access',
      },
      token,
      error: null,
    };
  } catch (error) {
    const reason = error?.message || 'invalid_token';
    return { user: null, error: reason, token };
  }
}

export function userHasRole(authContext, allowedRoles = []) {
  if (!authContext?.user) return false;
  if (!allowedRoles.length) return true;
  return allowedRoles.includes(authContext.user.role);
}
