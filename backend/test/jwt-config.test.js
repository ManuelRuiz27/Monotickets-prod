import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { getJwtExpirations } from '../src/config/jwt.js';

const keys = ['JWT_ACCESS_EXP', 'JWT_STAFF_EXP', 'JWT_VIEWER_EXP'];

describe('getJwtExpirations', () => {
  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it('returns defaults when variables are not provided', () => {
    const expirations = getJwtExpirations({});

    assert.equal(expirations.access, 8 * 60 * 60);
    assert.equal(expirations.staff, 24 * 60 * 60);
    assert.equal(expirations.viewer, 24 * 60 * 60);
  });

  it('parses durations from the environment', () => {
    process.env.JWT_ACCESS_EXP = '10h';
    process.env.JWT_STAFF_EXP = '2d';
    process.env.JWT_VIEWER_EXP = '90m';

    const expirations = getJwtExpirations(process.env);

    assert.equal(expirations.access, 10 * 60 * 60);
    assert.equal(expirations.staff, 2 * 24 * 60 * 60);
    assert.equal(expirations.viewer, 90 * 60);
  });

  it('throws when duration is invalid', () => {
    process.env.JWT_ACCESS_EXP = 'soon';

    assert.throws(() => {
      getJwtExpirations(process.env);
    }, /Invalid duration/);
  });
});
