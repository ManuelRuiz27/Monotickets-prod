import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createServer } from '../src/server.js';
import { decodeJwt } from '../src/auth/tokens.js';

describe('POST /auth/login', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.DB_DRIVER = 'memory';
    process.env.REDIS_DRIVER = 'memory';
    process.env.REDIS_URL = 'memory://local';
    process.env.QUEUES_DISABLED = '1';
    process.env.JWT_SECRET = 'integration-secret';
    process.env.JWT_ACCESS_TTL = '2h';
    process.env.JWT_STAFF_TTL = '3h';
    process.env.JWT_VIEWER_TTL = '4h';

    server = createServer({ env: process.env });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://${address.address}:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns signed tokens honouring the configured expirations', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'user-123', role: 'staff' }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.ok(body.accessToken);
    assert.ok(body.staffToken);
    assert.equal(body.requestId.length > 0, true);

    const access = decodeJwt(body.accessToken);
    const staff = decodeJwt(body.staffToken);

    assert.equal(access.payload.sub, 'user-123');
    assert.equal(access.payload.exp - access.payload.iat, 2 * 60 * 60);
    assert.equal(staff.payload.exp - staff.payload.iat, 3 * 60 * 60);
  });
});
