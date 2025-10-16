import { expect, test } from '@playwright/test';
import { getBackendBaseURL, getFrontendBaseURL } from '../fixtures/env';

function buildUrl(base: string, path: string) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`;
}

test.describe('@health critical availability checks', () => {
  test('@health @critical backend health endpoint should respond with OK payload', async ({ request }) => {
    const backendBase = getBackendBaseURL();
    const response = await request.get(buildUrl(backendBase, '/health'), {
      headers: { accept: 'application/json' },
    });

    expect(response.status(), 'backend health status').toBeGreaterThanOrEqual(200);
    expect(response.status(), 'backend health status').toBeLessThan(300);

    const payload = await response.json().catch(async () => {
      const text = await response.text();
      return { raw: text };
    });

    expect(payload).toBeTruthy();
    const serialized = JSON.stringify(payload).toLowerCase();
    expect(serialized).toContain('ok');
    test.info().annotations.push({
      type: 'backend-health',
      description: serialized,
    });
  });

  test('@health @critical frontend health endpoint should expose minimal status', async ({ request }) => {
    const frontendBase = getFrontendBaseURL();
    const response = await request.get(buildUrl(frontendBase, '/health'));

    expect(response.status(), 'frontend health status').toBeGreaterThanOrEqual(200);
    expect(response.status(), 'frontend health status').toBeLessThan(300);

    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      expect(payload).toBeTruthy();
      const serialized = JSON.stringify(payload).toLowerCase();
      expect(serialized).toMatch(/ok|ready|healthy|alive/);
      test.info().annotations.push({ type: 'frontend-health-json', description: serialized });
    } else {
      const text = (await response.text()).toLowerCase();
      expect(text.length).toBeGreaterThan(0);
      expect(text).toMatch(/ok|ready|healthy|alive/);
      test.info().annotations.push({ type: 'frontend-health-text', description: text.slice(0, 120) });
    }
  });
});
