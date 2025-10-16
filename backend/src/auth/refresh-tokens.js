import { randomUUID } from 'node:crypto';

import { query } from '../db/index.js';
import { getJwtExpirations } from '../config/jwt.js';
import { decodeJwt, getJwtSecret, signAccessToken, signRefreshToken, verifyJwt } from './tokens.js';

const DEFAULT_ROLE = 'user';

export class RefreshTokenError extends Error {
  constructor(message, { code = 'invalid_refresh_token', status = 401, details } = {}) {
    super(message);
    this.name = 'RefreshTokenError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function issueAuthTokens({
  userId,
  role = DEFAULT_ROLE,
  env = process.env,
  metadata = {},
}) {
  const expirations = getJwtExpirations(env);
  const refreshId = randomUUID();
  const accessToken = signAccessToken({ sub: userId, role, tokenType: 'access' }, { env });
  const refreshToken = signRefreshToken({ sub: userId, role, jti: refreshId, tokenType: 'refresh' }, { env });
  const refreshExpiresAt = new Date(Date.now() + expirations.refresh * 1000);

  await query(
    `INSERT INTO user_refresh_tokens (user_id, token_id, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5)`,
    [userId, refreshId, metadata.ipAddress || null, metadata.userAgent || null, refreshExpiresAt],
  );

  return { accessToken, refreshToken, refreshId, refreshExpiresAt };
}

export async function verifyRefreshToken({ token, env = process.env }) {
  if (!token || typeof token !== 'string') {
    throw new RefreshTokenError('Refresh token is required', { code: 'refresh_required', status: 400 });
  }

  const secret = getJwtSecret(env);
  if (!verifyJwt(token, secret)) {
    throw new RefreshTokenError('Refresh token signature invalid', { code: 'refresh_invalid_signature' });
  }

  const { payload } = decodeJwt(token);
  const now = Math.floor(Date.now() / 1000);

  if (!payload || payload.tokenType !== 'refresh') {
    throw new RefreshTokenError('Token is not a refresh token', { code: 'refresh_invalid_type' });
  }

  if (!payload.sub || !payload.jti) {
    throw new RefreshTokenError('Refresh token payload incomplete', { code: 'refresh_invalid_payload' });
  }

  if (!payload.exp || payload.exp < now) {
    throw new RefreshTokenError('Refresh token expired', { code: 'refresh_expired' });
  }

  const recordResult = await query(
    `SELECT id, user_id, token_id, revoked_at, expires_at
       FROM user_refresh_tokens
      WHERE token_id = $1
      LIMIT 1`,
    [payload.jti],
  );

  if (recordResult.rowCount === 0) {
    throw new RefreshTokenError('Refresh token not found', { code: 'refresh_not_found' });
  }

  const record = recordResult.rows[0];
  if (record.user_id !== payload.sub) {
    throw new RefreshTokenError('Refresh token subject mismatch', { code: 'refresh_subject_mismatch' });
  }

  if (record.revoked_at) {
    throw new RefreshTokenError('Refresh token revoked', { code: 'refresh_revoked' });
  }

  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
    throw new RefreshTokenError('Refresh token expired', { code: 'refresh_expired' });
  }

  return { record, payload };
}

export async function refreshAccessToken({ token, env = process.env }) {
  const { payload } = await verifyRefreshToken({ token, env });
  const role = payload.role || DEFAULT_ROLE;
  const accessToken = signAccessToken({ sub: payload.sub, role, tokenType: 'access' }, { env });
  return { accessToken, userId: payload.sub, role };
}

export async function revokeRefreshToken({ token, env = process.env }) {
  const { record } = await verifyRefreshToken({ token, env });
  await query(`UPDATE user_refresh_tokens SET revoked_at = now() WHERE id = $1`, [record.id]);
  return { revoked: true };
}

export const internals = {
  DEFAULT_ROLE,
};
