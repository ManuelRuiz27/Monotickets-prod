import { expect, test } from '@playwright/test';
import { directorRoutes, seeds } from '../fixtures/datasets';
import { getFrontendBaseURL } from '../fixtures/env';
import { getJSON, pollForResource, postJSON } from '../fixtures/http';

const frontendBase = getFrontendBaseURL();

test.describe('@director overview dashboards', () => {
  test('@director @kpi @cross-browser should show baseline KPIs in overview', async ({ page, request }) => {
    await test.step('open director overview', async () => {
      await page.goto(`${frontendBase}/director/overview`);
      await page.waitForURL(/director\/overview/);
    });

    await test.step('validate metrics via API', async () => {
      const response = await getJSON(request, directorRoutes.overview);
      expect(response.ok()).toBeTruthy();
      const payload = await response.json();
      expect(payload.confirmed ?? payload.metrics?.confirmed).toBeGreaterThanOrEqual(seeds.directorMetrics.confirmed);
      expect(payload.showUp ?? payload.metrics?.showUp).toBeGreaterThanOrEqual(seeds.directorMetrics.showUp);
      expect(payload.deliveries ?? payload.metrics?.deliveries).toBeGreaterThanOrEqual(
        seeds.directorMetrics.deliveries,
      );
    });
  });

  test('@director @kpi @cross-browser should refresh metrics after confirmations and scans', async ({ request }) => {
    const confirmCode = seeds.qr.valid;
    const confirmEndpoint = `${directorRoutes.confirm}/${encodeURIComponent(confirmCode)}`;
    const inviteEndpoint = `${directorRoutes.invite}/${encodeURIComponent(confirmCode)}`;

    const confirmResponse = await postJSON(request, confirmEndpoint, {
      location: seeds.staff.location,
      staffToken: seeds.staff.token,
    });

    expect(confirmResponse.status()).toBeLessThan(500);

    await pollForResource(
      request,
      directorRoutes.recentChanges,
      (payload) => {
        const lastUpdated = payload.lastUpdated || payload.updatedAt || payload.timestamp;
        if (!lastUpdated) {
          return false;
        }
        return new Date(lastUpdated).getTime() >= new Date(seeds.directorMetrics.lastUpdated).getTime();
      },
      { timeoutMs: 25_000, intervalMs: 2_000 },
    );

    const inviteResponse = await getJSON(request, inviteEndpoint);
    expect(inviteResponse.ok()).toBeTruthy();
    const invitePayload = await inviteResponse.json();
    expect(invitePayload.status || invitePayload.state).toMatch(/confirmed|ready/i);
  });
});
