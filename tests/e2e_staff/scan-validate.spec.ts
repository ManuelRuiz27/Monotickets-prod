import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { directorRoutes, seeds } from '../fixtures/datasets';
import { getFrontendBaseURL } from '../fixtures/env';
import { getJSON, postJSON } from '../fixtures/http';

const frontendBase = getFrontendBaseURL();
const staffTokenFromEnv = process.env.STAFF_TOKEN?.trim();
const staffToken = staffTokenFromEnv && staffTokenFromEnv.length > 0 ? staffTokenFromEnv : seeds.staff.token;
const scanEndpoint = directorRoutes.scanValidate;
const defaultEventId = seeds.delivery.eventId;

type ScanOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  authToken?: string | null;
  deviceId?: string;
};

async function performScan(request: APIRequestContext, code: string, options: ScanOptions = {}) {
  const payload = {
    code,
    eventId: defaultEventId,
    staffToken,
    location: seeds.staff.location,
    device: options.deviceId || 'e2e-staff-device',
    metadata: {
      source: 'e2e-scan-suite',
      issuedAt: new Date().toISOString(),
      ...(options.body?.metadata as Record<string, unknown> | undefined),
    },
    ...options.body,
  };

  const headers: Record<string, string> = {
    'x-request-source': 'e2e-tests',
    ...(options.headers || {}),
  };

  const tokenToUse = options.authToken === null ? null : options.authToken || staffToken;
  if (tokenToUse) {
    headers.Authorization = `Bearer ${tokenToUse}`;
  }

  return postJSON(request, scanEndpoint, payload, { headers });
}

async function captureRecentChangeTimestamp(request: APIRequestContext) {
  const response = await getJSON(request, directorRoutes.recentChanges);
  if (!response.ok()) {
    return null;
  }
  const payload = await response.json().catch(() => null);
  if (!payload) {
    return null;
  }
  const timestamp = payload.lastUpdated || payload.updatedAt || payload.timestamp;
  if (!timestamp) {
    return null;
  }
  const numeric = Date.parse(timestamp);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return { payload, numeric };
}

async function openScanInterface(page: Page) {
  await page.goto(`${frontendBase}/staff/scan`);
  await page.waitForLoadState('networkidle');
}

async function submitScanCode(page: Page, code: string) {
  const input = page.locator('#qr-input, [data-testid="qr-input"], input[name*="code" i], input[type="search"], input[type="text"]').first();
  await expect(input, 'scan input should be visible').toBeVisible();
  await input.fill(code);

  const submit = page
    .locator('[data-testid="submit-scan"], button:has-text("Escan"), button:has-text("Validar"), button:has-text("Confirmar")')
    .first();

  if (await submit.count()) {
    await submit.click();
  } else {
    await input.press('Enter');
  }
}

async function expectFeedbackMessage(
  page: Page,
  expectation: RegExp,
  type: 'success' | 'error',
) {
  const selectors =
    type === 'success'
      ? ['[data-testid="scan-success"]', '[data-testid="scan-feedback"]', '[role="status"]', '.toast-success']
      : ['[data-testid="scan-error"]', '[role="alert"]', '.toast-error'];

  const locator = page.locator(selectors.join(', '));
  if ((await locator.count()) === 0) {
    await expect(page.locator('body')).toContainText(expectation);
    return;
  }
  await expect(locator.first()).toContainText(expectation);
}

test.describe('@scan validation flows', () => {
  test('@scan @critical should validate a fresh QR code and surface success feedback', async ({ page, request }) => {
    const response = await performScan(request, seeds.qr.valid, {
      body: { metadata: { attempt: 'fresh-valid', provideHaptics: true } },
      deviceId: 'gate-a',
    });

    expect(response.status()).toBe(200);
    const payload = await response.json().catch(() => ({}));
    const status = String(payload.status || payload.state || '').toLowerCase();
    expect(status).toMatch(/valid|scann|ok/);

    if (payload.hapticFeedback || payload.feedback) {
      test.info().annotations.push({
        type: 'haptics',
        description: JSON.stringify({ hapticFeedback: payload.hapticFeedback, feedback: payload.feedback }),
      });
    }

    await test.step('Confirm visual feedback in staff UI', async () => {
      await openScanInterface(page);
      await submitScanCode(page, seeds.qr.valid);
      await expectFeedbackMessage(page, /escanead|válid|listo/i, 'success');
    });
  });

  test('@scan @error should reject malformed QR payloads without touching counters', async ({ request }) => {
    const before = await captureRecentChangeTimestamp(request);

    const response = await performScan(request, seeds.qr.invalid, {
      body: { metadata: { attempt: 'invalid-format' }, device: 'gate-b' },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);

    const payload = await response.json().catch(() => ({}));
    const serialized = JSON.stringify(payload).toLowerCase();
    expect(serialized).toContain('invalid');

    const after = await captureRecentChangeTimestamp(request);
    if (before?.numeric && after?.numeric) {
      expect(after.numeric).toBe(before.numeric);
    } else {
      test.info().annotations.push({
        type: 'recent-changes-unavailable',
        description: 'Recent changes endpoint did not return comparable timestamps',
      });
    }
  });

  test('@scan @error should flag duplicate scans and avoid double counting', async ({ page, request }) => {
    await performScan(request, seeds.qr.valid, {
      body: { metadata: { attempt: 'baseline-valid' } },
      deviceId: 'gate-c',
    });

    const before = await captureRecentChangeTimestamp(request);

    const duplicateResponse = await performScan(request, seeds.qr.duplicate, {
      body: { metadata: { attempt: 'duplicate-check' } },
      deviceId: 'gate-c',
    });

    expect(duplicateResponse.status()).toBeGreaterThanOrEqual(400);
    expect(duplicateResponse.status()).toBeLessThan(500);

    const payload = await duplicateResponse.json().catch(() => ({}));
    const serialized = JSON.stringify(payload).toLowerCase();
    expect(serialized).toMatch(/duplicate|ya usado/);

    const after = await captureRecentChangeTimestamp(request);
    if (before?.numeric && after?.numeric) {
      expect(after.numeric).toBe(before.numeric);
    }

    await test.step('UI surfaces duplicate warning', async () => {
      await openScanInterface(page);
      await submitScanCode(page, seeds.qr.duplicate);
      await expectFeedbackMessage(page, /duplicad|ya usado|revisar/i, 'error');
    });
  });

  test('@scan @error should prevent scans for expired events without retry affordance', async ({ page, request }) => {
    const response = await performScan(request, seeds.qr.expiredEvent, {
      body: { metadata: { attempt: 'expired-event' } },
      deviceId: 'gate-d',
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);

    const payload = await response.json().catch(() => ({}));
    const serialized = JSON.stringify(payload).toLowerCase();
    expect(serialized).toContain('expir');

    await test.step('Staff interface does not allow immediate retry', async () => {
      await openScanInterface(page);
      await submitScanCode(page, seeds.qr.expiredEvent);
      await expectFeedbackMessage(page, /expirad|autorización/i, 'error');
      const retryButton = page.locator('button:has-text("Reintentar")');
      if (await retryButton.count()) {
        await expect(retryButton.first()).toBeDisabled();
      }
    });
  });
});
