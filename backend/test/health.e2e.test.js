import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createServer } from '../src/server.js';
import { initializeDatabase } from '../src/db/bootstrap.js';
import packageJson from '../package.json' with { type: 'json' };

describe('Health and version endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.DB_DRIVER = 'memory';
    process.env.DB_SKIP_SEED = '1';
    process.env.REDIS_DRIVER = 'memory';
    process.env.REDIS_URL = 'memory://local';
    process.env.QUEUES_DISABLED = '1';
    process.env.JWT_SECRET = 'health-secret';
    process.env.JWT_ACCESS_TTL = '1h';
    process.env.GIT_COMMIT_SHORT = 'abc1234';

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

  it('reports database connectivity in /healthz', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, { status: 'ok', db: true });
  });

  it('returns app version and commit in /version', async () => {
    const response = await fetch(`${baseUrl}/version`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.version, packageJson.version);
    assert.equal(body.commit, 'abc1234');
  });
});
