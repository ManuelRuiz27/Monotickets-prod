import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { ensureRedis } from '../redis/client.js';
import { deliverOtp } from './otp-provider.js';
import {
  createUserWithCurp,
  findUserByCurp,
  isValidCurp,
  normalizeCurp,
  serializeUser,
  touchUserLogin,
} from '../modules/users.js';
import { issueAuthTokens } from './refresh-tokens.js';

const OTP_KEY_PREFIX = 'auth:otp';
const DEFAULT_LENGTH = 6;
const DEFAULT_EXPIRY_SECONDS = 300;
const DEFAULT_MAX_RESENDS = 3;
const DEFAULT_COOLDOWN_SECONDS = 60;
const DEFAULT_EXPIRY_CLEANUP_GRACE_SECONDS = 30;

export class OtpError extends Error {
  constructor(message, { code = 'otp_error', status = 400, retryAfterSeconds = 0 } = {}) {
    super(message);
    this.name = 'OtpError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function sendOtp({ curp, env = process.env, logger, ipAddress }) {
  const normalizedCurp = normalizeCurp(curp);
  if (!isValidCurp(normalizedCurp)) {
    throw new OtpError('CURP inválido', { code: 'invalid_curp', status: 400 });
  }

  const redis = await ensureRedis({ name: 'auth-otp', env, logger });
  const key = buildOtpKey(normalizedCurp);
  const existing = await readOtpRecord(redis, key);
  const now = Date.now();
  const maxResends = Number(env.OTP_MAX_RESENDS || DEFAULT_MAX_RESENDS);
  const cooldownSeconds = Number(env.OTP_COOLDOWN_SECONDS || DEFAULT_COOLDOWN_SECONDS);
  const ttlSeconds = Number(env.OTP_TTL_SECONDS || env.OTP_EXPIRES_SECONDS || DEFAULT_EXPIRY_SECONDS);
  const cleanupGraceSeconds = Number(
    env.OTP_EXPIRY_CLEANUP_GRACE_SECONDS || env.OTP_EXPIRATION_GRACE_SECONDS || DEFAULT_EXPIRY_CLEANUP_GRACE_SECONDS,
  );
  const otpLength = Number(env.OTP_LENGTH || DEFAULT_LENGTH);

  if (existing && existing.expiresAt <= now) {
    await redis.del(key);
  }

  if (existing && existing.expiresAt > now) {
    const elapsedSeconds = Math.floor((now - existing.lastSentAt) / 1000);
    if (elapsedSeconds < cooldownSeconds) {
      const retryAfterSeconds = cooldownSeconds - elapsedSeconds;
      throw new OtpError('OTP enviado recientemente', {
        code: 'otp_cooldown',
        status: 429,
        retryAfterSeconds,
      });
    }

    if (existing.resendCount + 1 > maxResends) {
      throw new OtpError('Se alcanzó el límite de reenvíos', {
        code: 'otp_resend_limit',
        status: 429,
      });
    }
  }

  const otp = generateOtp(Math.max(otpLength, DEFAULT_LENGTH));
  const expiresAt = now + ttlSeconds * 1000;
  const payload = {
    codeHash: hashOtp(otp),
    expiresAt,
    resendCount: existing ? existing.resendCount + 1 : 0,
    lastSentAt: now,
  };

  const ttlMs = expiresAt - now + Math.max(cleanupGraceSeconds * 1000, 0);
  await redis.set(key, JSON.stringify(payload), 'PX', Math.max(ttlMs, 1000));
  await deliverOtp({ curp: normalizedCurp, otp, env, logger, ipAddress });

  return { expiresAt };
}

export async function verifyOtp({ curp, otp, env = process.env, logger, metadata = {} }) {
  const normalizedCurp = normalizeCurp(curp);
  if (!isValidCurp(normalizedCurp)) {
    throw new OtpError('CURP inválido', { code: 'invalid_curp', status: 400 });
  }

  if (typeof otp !== 'string' || otp.trim().length === 0) {
    throw new OtpError('OTP requerido', { code: 'otp_required', status: 400 });
  }

  const redis = await ensureRedis({ name: 'auth-otp', env, logger });
  const key = buildOtpKey(normalizedCurp);
  const record = await readOtpRecord(redis, key);

  if (!record) {
    throw new OtpError('OTP no encontrado', { code: 'otp_not_found', status: 410 });
  }

  if (record.expiresAt <= Date.now()) {
    await redis.del(key);
    throw new OtpError('OTP expirado', { code: 'otp_expired', status: 410 });
  }

  const hashedInput = hashOtp(String(otp).trim());
  if (!timingSafeEqual(Buffer.from(hashedInput), Buffer.from(record.codeHash))) {
    throw new OtpError('OTP inválido', { code: 'otp_invalid', status: 401 });
  }

  await redis.del(key);

  let user = await findUserByCurp(normalizedCurp);
  if (!user) {
    user = await createUserWithCurp({ curp: normalizedCurp });
  }
  await touchUserLogin({ userId: user.id });

  const tokens = await issueAuthTokens({
    userId: user.id,
    env,
    metadata,
  });

  return {
    user: serializeUser(user),
    ...tokens,
  };
}

function buildOtpKey(curp) {
  return `${OTP_KEY_PREFIX}:${curp}`;
}

async function readOtpRecord(redis, key) {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function generateOtp(length = DEFAULT_LENGTH) {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, '0');
}

function hashOtp(otp) {
  return createHash('sha256').update(otp).digest('hex');
}

export const internals = {
  buildOtpKey,
  readOtpRecord,
  generateOtp,
  hashOtp,
};
