import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  decodeJwt,
  getJwtSecret,
  signAccessToken,
  signStaffToken,
  signViewerToken,
} from '../src/auth/tokens.js';

describe('JWT token helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_ACCESS_EXP = '1h';
    process.env.JWT_STAFF_EXP = '2h';
    process.env.JWT_VIEWER_EXP = '30m';
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    for (const key of [
      'JWT_SECRET',
      'JWT_ACCESS_EXP',
      'JWT_STAFF_EXP',
      'JWT_VIEWER_EXP',
    ]) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
  });

  it('requires JWT_SECRET to be configured', () => {
    delete process.env.JWT_SECRET;

    assert.throws(() => {
      getJwtSecret(process.env);
    }, /not configured/);
  });

  it('signs access tokens with configured expiration', () => {
    const token = signAccessToken({ sub: 'user-1' }, { env: process.env });
    const { payload } = decodeJwt(token);

    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.exp - payload.iat, 60 * 60);
  });

  it('signs staff tokens with configured expiration', () => {
    const token = signStaffToken({ sub: 'user-1' }, { env: process.env });
    const { payload } = decodeJwt(token);

    assert.equal(payload.exp - payload.iat, 2 * 60 * 60);
  });

  it('signs viewer tokens with configured expiration', () => {
    const token = signViewerToken({ sub: 'user-1' }, { env: process.env });
    const { payload } = decodeJwt(token);

    assert.equal(payload.exp - payload.iat, 30 * 60);
  });
});
