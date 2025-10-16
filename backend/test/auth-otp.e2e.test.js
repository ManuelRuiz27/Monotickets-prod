import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createServer } from '../src/server.js';
import { initializeDatabase } from '../src/db/bootstrap.js';
import { getOtpEvents } from '../src/auth/otp-provider.js';

function waitForOtp(curp) {
  return new Promise((resolve) => {
    const events = getOtpEvents();
    const handler = (payload) => {
      if (payload.curp === curp) {
        events.off('otp:sent', handler);
        resolve(payload.otp);
      }
    };
    events.on('otp:sent', handler);
  });
}

function configureOtpEnv({ ttl = '120', maxResends = '3', cooldown = '1' } = {}) {
  process.env.OTP_TTL_SECONDS = ttl;
  process.env.OTP_MAX_RESENDS = maxResends;
  process.env.OTP_COOLDOWN_SECONDS = cooldown;
}

describe('Auth OTP flow', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.DB_DRIVER = 'memory';
    process.env.REDIS_DRIVER = 'memory';
    process.env.REDIS_URL = 'memory://local';
    process.env.QUEUES_DISABLED = '1';
    process.env.JWT_SECRET = 'otp-secret';
    process.env.JWT_ACCESS_TTL = '10m';
    process.env.JWT_REFRESH_TTL = '1h';
    process.env.OTP_IP_MAX_REQUESTS = '20';
    process.env.OTP_IP_WINDOW_SECONDS = '60';

    configureOtpEnv();
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

  it('issues OTP and exchanges it for tokens', async () => {
    configureOtpEnv({ ttl: '120', maxResends: '3', cooldown: '1' });
    const curp = 'TEST900101HMCLNS03';
    const otpPromise = waitForOtp(curp);

    const sendResponse = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });

    assert.equal(sendResponse.status, 204);

    const otp = await otpPromise;
    assert.equal(typeof otp, 'string');
    assert.equal(otp.length, 6);

    const verifyResponse = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp, otp }),
    });

    assert.equal(verifyResponse.status, 200);
    const body = await verifyResponse.json();
    assert.ok(body.accessToken);
    assert.ok(body.refreshToken);
    assert.ok(body.user);
    assert.equal(body.user.curp, curp);
  });

  it('rejects OTP verification when code expired', async () => {
    configureOtpEnv({ ttl: '1', maxResends: '3', cooldown: '0' });
    const curp = 'EXPR900101HMCLNS06';
    const otpPromise = waitForOtp(curp);

    const sendResponse = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });
    assert.equal(sendResponse.status, 204);

    const otp = await otpPromise;
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const verifyResponse = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp, otp }),
    });

    assert.equal(verifyResponse.status, 410);
    const body = await verifyResponse.json();
    assert.equal(body.error, 'otp_expired');
  });

  it('enforces resend limits', async () => {
    configureOtpEnv({ ttl: '120', maxResends: '1', cooldown: '0' });
    const curp = 'LIMT900101HMCLNS02';

    let response = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });
    assert.equal(response.status, 204);

    response = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });
    assert.equal(response.status, 204);

    response = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.error, 'otp_resend_limit');
  });

  it('applies cooldown between OTP sends', async () => {
    configureOtpEnv({ ttl: '120', maxResends: '5', cooldown: '3' });
    const curp = 'COOL900101HMCLNS07';

    let response = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });
    assert.equal(response.status, 204);

    response = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });
    assert.equal(response.status, 429);
    const firstBody = await response.json();
    assert.equal(firstBody.error, 'otp_cooldown');

    await new Promise((resolve) => setTimeout(resolve, 3100));

    response = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curp }),
    });
    assert.equal(response.status, 204);
  });
});
