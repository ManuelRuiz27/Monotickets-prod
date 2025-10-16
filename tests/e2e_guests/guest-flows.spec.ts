import { expect, test } from '@playwright/test';
import { seeds } from '../fixtures/datasets';
import { getJSON, postJSON } from '../fixtures/http';

const defaultEventId = process.env.E2E_EVENT_ID || seeds.delivery.eventId || 'demo-event';

function normalizeGuestsPayload(payload: unknown) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'object' && Array.isArray((payload as any).guests)) {
    return (payload as any).guests;
  }
  return [];
}

test.describe('@guests critical flows', () => {
  test('@guests @critical should expose guest listing with minimal structure', async ({ request }) => {
    const response = await getJSON(request, `/events/${encodeURIComponent(defaultEventId)}/guests`);
    expect(response.ok(), 'guest list response ok').toBeTruthy();

    const payload = await response.json();
    const guests = normalizeGuestsPayload(payload);

    expect(Array.isArray(guests), 'guest list should be an array').toBeTruthy();
    if (guests.length === 0) {
      test.info().annotations.push({ type: 'guests-empty', description: `eventId=${defaultEventId}` });
      return;
    }

    const sample = guests[0];
    expect(sample).toBeTruthy();
    expect(typeof sample.id === 'string' || typeof sample.guestId === 'string').toBeTruthy();
    expect(typeof sample.name === 'string').toBeTruthy();
    expect(typeof sample.status === 'string').toBeTruthy();
    expect(sample.status.length).toBeGreaterThan(0);
  });

  test('@guests should validate guest creation payloads and surface controlled errors', async ({ request }) => {
    const listBeforeResponse = await getJSON(request, `/events/${encodeURIComponent(defaultEventId)}/guests`);
    const beforePayload = await listBeforeResponse.json().catch(() => ({ guests: [] }));
    const beforeGuests = normalizeGuestsPayload(beforePayload);
    const beforeCount = beforeGuests.length;

    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const newGuest = {
      name: `E2E Guest ${uniqueSuffix}`,
      email: `e2e-guest-${uniqueSuffix}@example.com`,
      phone: `555${Date.now().toString().slice(-7)}`,
      status: 'pending',
    };

    const createResponse = await postJSON(request, `/events/${encodeURIComponent(defaultEventId)}/guests`, newGuest, {
      headers: { 'x-request-source': 'e2e-tests' },
    });

    const status = createResponse.status();
    if (status >= 200 && status < 300) {
      const body = await createResponse.json();
      expect(body).toMatchObject({
        name: newGuest.name,
        email: newGuest.email,
      });
      const confirmationLink = body.confirmation_link || body.confirmationLink;
      if (typeof confirmationLink === 'string') {
        expect(confirmationLink).toContain('http');
      }

      const listAfterResponse = await getJSON(request, `/events/${encodeURIComponent(defaultEventId)}/guests`);
      const afterPayload = await listAfterResponse.json().catch(() => ({ guests: [] }));
      const afterGuests = normalizeGuestsPayload(afterPayload);
      expect(afterGuests.length).toBeGreaterThanOrEqual(beforeCount);
    } else {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      const errorPayload = await createResponse.json().catch(() => ({}));
      const serialized = JSON.stringify(errorPayload).toLowerCase();
      expect(serialized).toMatch(/invalid|not_found|conflict|duplicate|template/);

      const listAfterResponse = await getJSON(request, `/events/${encodeURIComponent(defaultEventId)}/guests`);
      const afterPayload = await listAfterResponse.json().catch(() => ({ guests: [] }));
      const afterGuests = normalizeGuestsPayload(afterPayload);
      expect(afterGuests.length).toBe(beforeCount);
    }
  });
});
