const DEFAULTS = {
  JWT_ACCESS_EXP: '8h',
  JWT_STAFF_EXP: '24h',
  JWT_VIEWER_EXP: '24h',
};

const UNIT_IN_SECONDS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

export function getJwtExpirations(env = process.env) {
  return {
    access: readDuration(env, 'JWT_ACCESS_EXP'),
    staff: readDuration(env, 'JWT_STAFF_EXP'),
    viewer: readDuration(env, 'JWT_VIEWER_EXP'),
  };
}

function readDuration(env, key) {
  const rawValue = (env[key] || DEFAULTS[key]).trim();
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

export const internals = {
  readDuration,
  UNIT_IN_SECONDS,
  DEFAULTS,
};
