import { createHmac, timingSafeEqual } from 'node:crypto';

import { getJwtClaims, getJwtExpirations } from '../config/jwt.js';

const JWT_ALGORITHM = 'HS256';

export function getJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error('JWT_SECRET is not configured');
  }

  return secret;
}

export function signAccessToken(payload, options = {}) {
  return signToken(payload, 'access', options);
}

export function signStaffToken(payload, options = {}) {
  return signToken(payload, 'staff', options);
}

export function signViewerToken(payload, options = {}) {
  return signToken(payload, 'viewer', options);
}

function signToken(payload, type, options = {}) {
  const { env = process.env } = options;
  const secret = getJwtSecret(env);
  const expirations = getJwtExpirations(env);
  const claims = getJwtClaims(env);
  const expiresInSeconds = expirations[type];

  if (!expiresInSeconds) {
    throw new Error(`Unknown JWT token type: ${type}`);
  }

  const header = {
    alg: JWT_ALGORITHM,
    typ: 'JWT',
  };

  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iss: claims.issuer,
    aud: claims.audience,
    tokenType: type,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };

  const encodedHeader = encodeSegment(header);
  const encodedPayload = encodeSegment(tokenPayload);
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function decodeJwt(token) {
  const [encodedHeader, encodedPayload, signature] = token.split('.');

  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error('Invalid token format');
  }

  const header = decodeSegment(encodedHeader);
  const payload = decodeSegment(encodedPayload);

  return { header, payload, signature };
}

export function verifyJwt(token, secret) {
  const [encodedHeader, encodedPayload, signature] = token.split('.');

  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error('Invalid token format');
  }

  const expectedSignature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);
  if (expectedSignature.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

function createSignature(input, secret) {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

export const internals = {
  signToken,
  createSignature,
  encodeSegment,
  decodeSegment,
};
