import { query } from '../db/index.js';

export const CURP_REGEX = /^[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]{2}$/i;

export function normalizeCurp(curp) {
  if (typeof curp !== 'string') {
    return '';
  }
  return curp.trim().toUpperCase();
}

export function isValidCurp(curp) {
  const normalized = normalizeCurp(curp);
  return Boolean(normalized) && CURP_REGEX.test(normalized);
}

export async function findUserByCurp(curp) {
  const normalized = normalizeCurp(curp);
  if (!normalized) {
    return null;
  }

  const result = await query(
    `SELECT id, curp, status, last_login_at, created_at, updated_at
       FROM users
      WHERE curp = $1
      LIMIT 1`,
    [normalized],
  );
  return result.rows[0] || null;
}

export async function createUserWithCurp({ curp, status = 'pending' }) {
  const normalized = normalizeCurp(curp);
  const result = await query(
    `INSERT INTO users (curp, status)
      VALUES ($1, $2)
   RETURNING id, curp, status, last_login_at, created_at, updated_at`,
    [normalized, status],
  );
  return result.rows[0];
}

export async function touchUserLogin({ userId }) {
  await query(`UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`, [userId]);
}

export function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    curp: row.curp,
    status: row.status,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export const internals = {
  normalizeCurp,
  isValidCurp,
};
