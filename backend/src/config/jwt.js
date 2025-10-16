const DEFAULTS = {
  JWT_ACCESS_TTL: '8h',
  JWT_REFRESH_TTL: '30d',
  JWT_STAFF_TTL: '24h',
  JWT_VIEWER_TTL: '24h',
};

const LEGACY_KEYS = {
  JWT_ACCESS_TTL: 'JWT_ACCESS_EXP',
  JWT_REFRESH_TTL: null,
  JWT_STAFF_TTL: 'JWT_STAFF_EXP',
  JWT_VIEWER_TTL: 'JWT_VIEWER_EXP',
};

const UNIT_IN_SECONDS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

export function getJwtExpirations(env = process.env) {
  return {
    access: readDuration(env, 'JWT_ACCESS_TTL'),
    refresh: readDuration(env, 'JWT_REFRESH_TTL'),
    staff: readDuration(env, 'JWT_STAFF_TTL'),
    viewer: readDuration(env, 'JWT_VIEWER_TTL'),
  };
}

export function getJwtClaims(env = process.env) {
  const issuer = (env.JWT_ISSUER || 'monotickets.api').trim();
  const audience = (env.JWT_AUDIENCE || 'monotickets.clients').trim();

  if (!issuer || !audience) {
    throw new Error('JWT issuer and audience must be configured');
  }

  return { issuer, audience };
}

function readDuration(env, key) {
  const rawValue = resolveDurationValue(env, key);
  const match = rawValue.match(/^(\d+)([smhd])$/i);

  if (!match) {
    throw new Error(`Invalid duration format for ${key}: ${rawValue}`);
  }

  const [, amount, unit] = match;
  const factor = UNIT_IN_SECONDS[unit.toLowerCase()];

  if (!factor) {
    throw new Error(`Unsupported duration unit for ${key}: ${unit}`);
  }

  return Number(amount) * factor;
}

function resolveDurationValue(env, key) {
  const primary = String(env[key] || '').trim();
  if (primary) {
    return primary;
  }
  const legacyKey = LEGACY_KEYS[key];
  if (legacyKey) {
    const legacy = String(env[legacyKey] || '').trim();
    if (legacy) {
      return legacy;
    }
  }
  const defaultValue = DEFAULTS[key] || (legacyKey ? DEFAULTS[legacyKey] : '');
  if (defaultValue) {
    return defaultValue;
  }
  throw new Error(`Duration for ${key} is not configured`);
}

export const internals = {
  readDuration,
  UNIT_IN_SECONDS,
  DEFAULTS,
  getJwtClaims,
  resolveDurationValue,
  LEGACY_KEYS,
};
