import { expect, test } from '@playwright/test';
import { getFrontendBaseURL } from '../fixtures/env';

const frontendBase = getFrontendBaseURL();

type EventRecord = {
  id: string;
  name: string;
  type: 'standard' | 'premium';
  landing_ttl_days: number;
  start_date: string;
  location?: string;
};

type GuestRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'pending' | 'confirmed' | 'scanned';
};

test.describe('@organizer @cross-browser organizer workflows', () => {
  test('@organizer @cross-browser should create standard and premium events with guest imports', async ({ page }) => {
    const createdEvents: EventRecord[] = [];
    const guestStore = new Map<string, GuestRecord[]>();
    const bulkDispatches = new Map<string, number>();
    const generatedLinks: { eventId: string; guestId?: string; url: string }[] = [];

    await page.route('**/events**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      const fulfill = async (status: number, body: unknown) => {
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      };

      if (method === 'GET' && path === '/events') {
        return fulfill(200, {
          data: createdEvents,
          total: createdEvents.length,
          page: Number(url.searchParams.get('page') || '1'),
          pageSize: 10,
        });
      }

      if (method === 'POST' && path === '/events') {
        const payload = request.postDataJSON();
        const id = `evt-${createdEvents.length + 1}`;
        const record: EventRecord = {
          id,
          name: payload.name,
          type: payload.type ?? 'standard',
          landing_ttl_days: payload.landing_ttl_days ?? 7,
          start_date: payload.start_date,
          location: payload.location,
        };
        createdEvents.push(record);
        guestStore.set(id, []);
        return fulfill(201, {
          ...record,
          status: 'draft',
          landing_kind: record.type,
          end_date: payload.end_date ?? null,
          description: payload.description ?? '',
        });
      }

      const eventIdMatch = path.match(/^\/events\/([^/]+)/);
      const eventId = eventIdMatch?.[1];
      if (!eventId) {
        return route.continue();
      }

      if (method === 'GET' && path === `/events/${eventId}`) {
        const event = createdEvents.find((item) => item.id === eventId);
        if (!event) {
          return fulfill(404, { error: 'not_found' });
        }
        return fulfill(200, {
          ...event,
          status: 'draft',
          landing_kind: event.type,
          metrics: {
            confirmationRate: 0,
            averageConfirmationTimeMinutes: 0,
            confirmedGuests: 0,
            scannedGuests: 0,
            pendingGuests: guestStore.get(eventId)?.length ?? 0,
          },
        });
      }

      if (method === 'GET' && path === `/events/${eventId}/guests`) {
        const guests = guestStore.get(eventId) ?? [];
        const statusFilter = url.searchParams.get('status');
        const filtered = statusFilter ? guests.filter((guest) => guest.status === statusFilter) : guests;
        return fulfill(200, filtered);
      }

      if (method === 'POST' && path === `/events/${eventId}/guests`) {
        const payload = request.postDataJSON();
        const guest: GuestRecord = {
          id: `gst-${(guestStore.get(eventId) ?? []).length + 1}`,
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          status: 'pending',
        };
        const guests = guestStore.get(eventId) ?? [];
        guests.push(guest);
        guestStore.set(eventId, guests);
        return fulfill(201, {
          ...guest,
          confirmation_link: `https://monotickets.test/invite/${eventId}/${guest.id}`,
        });
      }

      if (method === 'POST' && path === `/events/${eventId}/whatsapp/send`) {
        const guests = guestStore.get(eventId) ?? [];
        bulkDispatches.set(eventId, guests.length);
        return fulfill(202, { queued: guests.length, eventId });
      }

      if (method === 'POST' && path.endsWith('/whatsapp/link')) {
        const segments = path.split('/');
        const maybeGuestId = segments.length > 5 ? segments[4] : undefined;
        const reference = `ref-${eventId}-${maybeGuestId ?? 'general'}`;
        const link = {
          link: `https://wa.me/5491100000000?text=${encodeURIComponent(reference)}`,
          reference,
          guestId: maybeGuestId,
        };
        generatedLinks.push({ eventId, guestId: maybeGuestId, url: link.link });
        return fulfill(200, link);
      }

      if (method === 'DELETE' && path === `/events/${eventId}/cache`) {
        return fulfill(200, { status: 'ok' });
      }

      if (method === 'POST' && path.endsWith('/guests/import')) {
        // Simulate import acknowledgement.
        return fulfill(200, { imported: 0, errors: [] });
      }

      return route.continue();
    });

    await page.goto(`${frontendBase}/organizer/events/new`);
    await expect(page.locator('#new-event-title')).toContainText('Nuevo evento');

    await page.fill('#event-name', 'Lanzamiento Standard');
    await page.fill('#event-location', 'Auditorio Central');
    await page.fill('#event-start', '2024-06-15T18:00');
    await page.fill('#event-end', '2024-06-16T02:00');
    await page.fill('#event-description', 'Evento de lanzamiento con streaming y experiencia híbrida.');
    await page.fill('#event-cover', 'https://cdn.example.com/cover.jpg');
    await page.fill('#event-pdf', 'https://cdn.example.com/invite.pdf');
    await page.fill('#event-landing', 'https://monotickets.test/lanzamiento');
    await page.fill('#landing-ttl', '10');

    await page.click('button:has-text("Siguiente")');

    await page.fill('#guest-name', 'Ada Lovelace');
    await page.fill('#guest-email', 'ada@example.com');
    await page.fill('#guest-phone', '5512345678');
    await page.click('button:has-text("Agregar invitado")');

    await page.fill('#csv-import', 'Grace Hopper,grace@example.com,5512345679');
    await page.click('button:has-text("Procesar CSV")');
    await expect(page.locator('h3:has-text("Vista previa")')).toContainText('(2)');

    const creationResponse = page.waitForResponse((res) => res.request().url().includes('/events') && res.request().method() === 'POST');
    await page.click('button:has-text("Siguiente")');
    await expect(page.locator('text=Evento guardado').first()).toBeVisible();
    await creationResponse;

    const guestResponses = await Promise.all(
      [
        page.waitForResponse((res) => res.request().url().match(/\/events\/.*\/guests$/) !== null),
        page.waitForResponse((res) => res.request().url().match(/\/events\/.*\/guests$/) !== null),
      ],
    );
    guestResponses.forEach((response) => expect(response.ok()).toBeTruthy());

    const generalLinkResponse = page.waitForResponse((res) =>
      res.request().url().includes('/whatsapp/link') && res.request().method() === 'POST',
    );
    await page.click('button:has-text("Generar link general")');
    await generalLinkResponse;
    const bulkResponse = page.waitForResponse((res) =>
      res.request().url().includes('/whatsapp/send') && res.request().method() === 'POST',
    );
    await page.click('button:has-text("Enviar masivo")');
    await bulkResponse;
    const linkResponse = page.waitForResponse((res) =>
      res.request().url().includes('/whatsapp/link') && res.request().method() === 'POST',
    );
    await page.click('button:has-text("Link individual")');
    await linkResponse;
    await expect(page.locator('body')).toContainText(/programaron|Enlace generado/i);

    const cacheResponse = page.waitForResponse((res) =>
      res.request().url().includes('/cache') && res.request().method() === 'DELETE',
    );
    await page.click('button:has-text("Finalizar")');
    await cacheResponse;
    await expect(page.locator('text=El evento quedó configurado').first()).toBeVisible();

    await page.fill('#event-name', 'Gala Premium');
    await page.fill('#event-location', 'Salón Dorado');
    await page.fill('#event-start', '2024-09-05T20:00');
    await page.click('label:has-text("Premium")');
    await expect(page.locator('#event-pdf')).toBeDisabled();
    await page.fill('#event-flipbook', 'https://viewer.example.com/flipbook');

    await page.click('button:has-text("Siguiente")');
    await page.fill('#guest-name', 'Linus Torvalds');
    await page.fill('#guest-email', 'linus@example.com');
    await page.fill('#guest-phone', '5512345680');
    await page.click('button:has-text("Agregar invitado")');

    const premiumCreation = page.waitForResponse((res) => res.request().url().includes('/events') && res.request().method() === 'POST' && res.status() === 201);
    await page.click('button:has-text("Siguiente")');
    await premiumCreation;

    const premiumGeneralLinkResponse = page.waitForResponse((res) =>
      res.request().url().includes('/whatsapp/link') && res.request().method() === 'POST',
    );
    await page.click('button:has-text("Generar link general")');
    await premiumGeneralLinkResponse;
    const premiumLinkResponse = page.waitForResponse((res) =>
      res.request().url().includes('/whatsapp/link') && res.request().method() === 'POST',
    );
    await page.click('button:has-text("Link individual")');
    await premiumLinkResponse;
    await page.click('button:has-text("Finalizar")');

    expect(createdEvents).toHaveLength(2);
    expect(createdEvents.map((event) => event.type)).toEqual(expect.arrayContaining(['standard', 'premium']));

    const [standardEvent, premiumEvent] = createdEvents;
    expect(guestStore.get(standardEvent.id)?.length).toBeGreaterThanOrEqual(2);
    expect(guestStore.get(premiumEvent.id)?.length).toBeGreaterThanOrEqual(1);
    expect(bulkDispatches.get(standardEvent.id)).toBeGreaterThanOrEqual(1);
    expect(generatedLinks.some((entry) => entry.eventId === standardEvent.id)).toBeTruthy();
    expect(generatedLinks.some((entry) => entry.eventId === premiumEvent.id && entry.guestId)).toBeTruthy();
  });
});
