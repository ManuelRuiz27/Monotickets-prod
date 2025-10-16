import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';

import { createServer } from '../src/server.js';
import { initializeDatabase } from '../src/db/bootstrap.js';
import { query } from '../src/db/index.js';
import { signAccessToken } from '../src/auth/tokens.js';

async function createTestUser() {
  const curp = randomUUID().replace(/-/g, '').slice(0, 18).padEnd(18, 'X');
  const result = await query(
    `INSERT INTO users (curp, status)
     VALUES ($1, $2)
     RETURNING id, curp, status`,
    [curp, 'active'],
  );

  return result.rows[0];
}

describe('Push subscriptions API', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.DB_DRIVER = 'memory';
    process.env.DB_SKIP_SEED = '1';
    process.env.REDIS_DRIVER = 'memory';
    process.env.REDIS_URL = 'memory://local';
    process.env.QUEUES_DISABLED = '1';
    process.env.JWT_SECRET = 'push-subscription-secret';
    process.env.JWT_ACCESS_TTL = '1h';

    await initializeDatabase({ env: process.env });

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

  afterEach(async () => {
    await query('DELETE FROM push_subscriptions');
  });

  it('creates a push subscription for authenticated users', async () => {
    const user = await createTestUser();
    const token = signAccessToken({ sub: user.id, role: 'organizer' }, { env: process.env });

    const payload = {
      endpoint: 'https://example.com/push/1',
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-secret',
    };

    const response = await fetch(`${baseUrl}/push/subscriptions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 201);
    const body = await response.json();

    assert.ok(body.data.id);
    assert.equal(body.data.userId, user.id);
    assert.equal(body.data.endpoint, payload.endpoint);
    assert.equal(body.data.p256dh, payload.p256dh);
    assert.equal(body.data.auth, payload.auth);
    assert.equal(typeof body.requestId, 'string');
  });

  it('returns 409 when creating a duplicate subscription for the same user', async () => {
    const user = await createTestUser();
    const token = signAccessToken({ sub: user.id, role: 'organizer' }, { env: process.env });
    const payload = {
      endpoint: 'https://example.com/push/duplicate',
      p256dh: 'duplicate-p256dh',
      auth: 'duplicate-auth',
    };

    const firstResponse = await fetch(`${baseUrl}/push/subscriptions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(firstResponse.status, 201);

    const secondResponse = await fetch(`${baseUrl}/push/subscriptions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(secondResponse.status, 409);
    const errorBody = await secondResponse.json();
    assert.equal(errorBody.error, 'subscription_exists');
  });

  it('deletes an existing subscription and allows recreating it', async () => {
    const user = await createTestUser();
    const token = signAccessToken({ sub: user.id, role: 'organizer' }, { env: process.env });
    const payload = {
      endpoint: 'https://example.com/push/delete',
      p256dh: 'delete-p256dh',
      auth: 'delete-auth',
    };

    const createResponse = await fetch(`${baseUrl}/push/subscriptions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();

    const deleteResponse = await fetch(`${baseUrl}/push/subscriptions/${created.data.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(deleteResponse.status, 204);

    const recreateResponse = await fetch(`${baseUrl}/push/subscriptions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(recreateResponse.status, 201);
  });

  it('requires authentication to create a subscription', async () => {
    const response = await fetch(`${baseUrl}/push/subscriptions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://example.com/push/no-auth',
        p256dh: 'no-auth-p256dh',
        auth: 'no-auth-auth',
      }),
    });

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'missing_token');
  });
});
