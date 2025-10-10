import { expect, test } from '@playwright/test';
import { directorRoutes, seeds } from '../fixtures/datasets';
import { getFrontendBaseURL } from '../fixtures/env';
import { postJSON } from '../fixtures/http';

const frontendBase = getFrontendBaseURL();

test.describe('@director qr error handling', () => {
  test('@director should reject duplicate QR scans with visual feedback', async ({ page, request }) => {
    const duplicateCode = seeds.qr.duplicate;
    const endpoint = `${directorRoutes.scanValidate}`;

    const response = await postJSON(request, endpoint, {
      code: duplicateCode,
      eventId: seeds.delivery.eventId,
      simulateDuplicate: true,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);

    const payload = await response.json().catch(() => ({}));
    expect(JSON.stringify(payload).toLowerCase()).toContain('duplicate');

    await page.goto(`${frontendBase}/staff/scan`);
    await page.locator('[data-testid="qr-input"]').fill(duplicateCode);
    await page.locator('[data-testid="submit-scan"]').click();
    const errorLocator = page.locator('[data-testid="scan-error"]');
    await expect(errorLocator).toContainText(/duplicate|ya usado/i);
  });

  test('@director should surface invalid QR errors without side-effects', async ({ request }) => {
    const response = await postJSON(request, directorRoutes.scanValidate, {
      code: seeds.qr.invalid,
      eventId: seeds.delivery.eventId,
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);

    const payload = await response.json().catch(() => ({}));
    expect(JSON.stringify(payload).toLowerCase()).toContain('invalid');
  });

  test('@director should redirect expired events to fallback', async ({ page }) => {
    await page.goto(`${frontendBase}/public/invite/${encodeURIComponent(seeds.qr.expiredEvent)}`);
    await expect(page).toHaveURL(/expired|fallback|pdf/i);
    const stateLocator = page.locator('[data-testid="event-state"]');
    if (await stateLocator.count()) {
      await expect(stateLocator.first()).toContainText(/no vigente|expirado/i);
    }
  });

  test('@director should enforce rate limiting on confirmation endpoints', async ({ request }) => {
    const confirmEndpoint = `${directorRoutes.confirm}/${encodeURIComponent(seeds.qr.valid)}`;
    const attempts = 8;
    let limited = false;

    for (let i = 0; i < attempts; i += 1) {
      const response = await postJSON(request, confirmEndpoint, {
        location: seeds.staff.location,
        staffToken: seeds.staff.token,
        burstAttempt: i,
      });
      if (response.status() === 429) {
        limited = true;
        break;
      }
    }

    expect(limited).toBeTruthy();
  });
});
