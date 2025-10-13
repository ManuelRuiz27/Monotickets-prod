import type { GuestModel, GuestStatus, EventStatus, LandingKind } from '@shared/models/delivery';
import { handleError } from '@shared/api/errors';

export type { GuestStatus, EventStatus, LandingKind };

export interface EventSummary {
  id: string;
  name: string;
  startsAt: string;
  endsAt?: string | null;
  status: EventStatus;
  type: LandingKind;
  landingKind: LandingKind;
  landingTtlDays: number;
}

export interface Guest extends GuestModel {}

export interface EventDetail extends EventSummary {
  description?: string;
  location?: string;
  coverUrl?: string | null;
  pdfUrl?: string | null;
  flipbookUrl?: string | null;
  landingUrl?: string | null;
  galleryUrls?: string[];
  metrics?: ConfirmationMetrics;
  whatsappTemplate?: string;
}

export type ConfirmationState = GuestStatus;

export interface ConfirmationMetrics {
  confirmationRate: number;
  averageConfirmationTimeMinutes: number;
  confirmedGuests: number;
  scannedGuests: number;
  pendingGuests: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GuestImportError {
  row: number;
  message: string;
}

export interface GuestImportResult {
  imported: number;
  errors: GuestImportError[];
}

export interface CreateEventPayload {
  name: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt?: string;
  type: LandingKind;
  coverUrl?: string;
  pdfUrl?: string;
  flipbookUrl?: string;
  landingUrl?: string;
  landingTtlDays: number;
}

export interface GuestPayload {
  name: string;
  email: string;
  phone: string;
  note?: string;
}

export interface WhatsappLink {
  link: string;
  reference: string;
  guestId?: string;
}

const API_BASE =
  process.env.DASHBOARD_NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  '';

const USE_MOCK = !API_BASE;

const MOCK_EVENTS: EventDetail[] = [
  {
    id: 'evt-gala-2024',
    name: 'Gala Innovación 2024',
    description: 'Ceremonia principal con premiación y números musicales.',
    location: 'Auditorio Reforma · CDMX',
    startsAt: new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(),
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 76).toISOString(),
    status: 'live',
    type: 'premium',
    landingKind: 'premium',
    landingTtlDays: 120,
    landingUrl: '#',
  },
  {
    id: 'evt-summit-pre',
    name: 'Summit Premium Riviera',
    description: 'Experiencia previa al summit con conferencias exclusivas.',
    location: 'Centro de Convenciones Riviera',
    startsAt: new Date(Date.now() + 1000 * 60 * 60 * 240).toISOString(),
    status: 'draft',
    type: 'standard',
    landingKind: 'standard',
    landingTtlDays: 90,
    landingUrl: '#',
  },
  {
    id: 'evt-after-2023',
    name: 'After Office Backstage',
    description: 'Evento de agradecimiento para equipos y speakers.',
    location: 'Sala VIP Auditorio Reforma',
    startsAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    endsAt: new Date(Date.now() - 1000 * 60 * 60 * 44).toISOString(),
    status: 'completed',
    type: 'standard',
    landingKind: 'standard',
    landingTtlDays: 30,
    landingUrl: '#',
  },
];

const MOCK_GUESTS: Record<string, Guest[]> = {
  'evt-gala-2024': [
    {
      id: 'gst-ada',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+52 55 1010 0001',
      status: 'confirmed',
      confirmedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      lastSentAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      confirmationLink: '#',
    },
    {
      id: 'gst-grace',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      phone: '+52 55 1010 0002',
      status: 'pending',
      lastSentAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      confirmationLink: '#',
    },
    {
      id: 'gst-alan',
      name: 'Alan Turing',
      email: 'alan@example.com',
      phone: '+52 55 1010 0003',
      status: 'scanned',
      confirmedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
      scannedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      confirmationLink: '#',
    },
  ],
  'evt-summit-pre': [],
  'evt-after-2023': [],
};

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  if (USE_MOCK) {
    return mockRequest<T>(input, init);
  }

  try {
    const url = typeof input === 'string' ? `${API_BASE}${input}` : input;
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      await handleError(res, {
        scope: 'organizer-api',
        request: typeof input === 'string' ? input : input.toString(),
      });
    }
    return res.json() as Promise<T>;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[organizer-api] usando datos mock para', input, error);
    }
    return mockRequest<T>(input, init);
  }
}

function mockRequest<T>(input: RequestInfo | URL, init?: RequestInit): T {
  const href = typeof input === 'string' ? input : input.toString();
  const url = new URL(href, 'https://mock.monotickets.local');
  const { pathname, searchParams } = url;

  if (pathname === '/events') {
    const page = Number(searchParams.get('page') ?? '1');
    const status = searchParams.get('status') as EventStatus | null;
    const filtered = status ? MOCK_EVENTS.filter((event) => event.status === status) : MOCK_EVENTS;
    const pageSize = 6;
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);
    return clone({ data, total: filtered.length, page, pageSize }) as T;
  }

  if (pathname.startsWith('/events/') && !pathname.includes('/guests')) {
    const eventId = pathname.split('/')[2];
    const event = MOCK_EVENTS.find((item) => item.id === eventId);
    if (!event) throw new Error(`Mock organizer API: evento ${eventId} no encontrado`);
    return clone({
      ...event,
      metrics: computeMetrics(eventId),
    }) as T;
  }

  if (pathname === '/events' && init?.method === 'POST') {
    const payload = init.body ? JSON.parse(String(init.body)) : {};
    const id = `evt-${Date.now()}`;
    const newEvent: EventDetail = {
      id,
      name: payload.name ?? 'Nuevo evento',
      description: payload.description ?? '',
      location: payload.location ?? '',
      startsAt: payload.startsAt ?? new Date().toISOString(),
      endsAt: payload.endsAt ?? null,
      status: 'draft',
      type: payload.type ?? 'standard',
      landingKind: payload.landingKind ?? payload.type ?? 'standard',
      landingTtlDays: payload.landingTtlDays ?? 60,
      landingUrl: payload.landingUrl ?? '#',
    };
    MOCK_EVENTS.unshift(newEvent);
    MOCK_GUESTS[id] = [];
    return clone({ ...newEvent, metrics: computeMetrics(id) }) as T;
  }

  if (pathname.startsWith('/events/') && init?.method === 'PATCH') {
    const eventId = pathname.split('/')[2];
    const payload = init.body ? JSON.parse(String(init.body)) : {};
    const event = MOCK_EVENTS.find((item) => item.id === eventId);
    if (!event) throw new Error(`Mock organizer API: evento ${eventId} no encontrado`);
    Object.assign(event, payload);
    return clone({ ...event, metrics: computeMetrics(eventId) }) as T;
  }

  if (pathname.match(/\/events\/[^/]+\/guests$/) && (!init?.method || init.method === 'GET')) {
    const eventId = pathname.split('/')[2];
    const guests = MOCK_GUESTS[eventId] ?? [];
    const status = searchParams.get('status') as ConfirmationState | null;
    const query = (searchParams.get('search') ?? '').toLowerCase();
    let filtered = guests;
    if (status) {
      filtered = filtered.filter((guest) => guest.status === status);
    }
    if (query) {
      filtered = filtered.filter((guest) =>
        [guest.name, guest.email, guest.phone].some((field) => field.toLowerCase().includes(query))
      );
    }
    return clone(filtered) as T;
  }

  if (pathname.match(/\/events\/[^/]+\/guests$/) && init?.method === 'POST') {
    const eventId = pathname.split('/')[2];
    const payload = init.body ? JSON.parse(String(init.body)) : {};
    const guest: Guest = {
      id: `gst-${Date.now()}`,
      name: payload.name ?? 'Invitado sin nombre',
      email: payload.email ?? 'demo@example.com',
      phone: payload.phone ?? '+52 55 0000 0000',
      status: 'pending',
      lastSentAt: null,
      confirmationLink: '#',
    };
    (MOCK_GUESTS[eventId] ??= []).push(guest);
    return clone(guest) as T;
  }

  if (pathname.match(/\/events\/[^/]+\/guests\/import$/)) {
    return { imported: 10, errors: [] } as T;
  }

  if (pathname.match(/\/events\/[^/]+\/guests\/[\w-]+\/send$/)) {
    return { status: 'sent', guestId: pathname.split('/')[4] } as T;
  }

  if (pathname.match(/\/events\/[^/]+\/whatsapp\/send$/)) {
    return { queued: 25 } as T;
  }

  if (pathname.match(/\/events\/[^/]+(?:\/guests\/[\w-]+)?\/whatsapp\/link$/)) {
    return {
      link: 'https://wa.me/5215510000000?text=Hola+desde+Monotickets',
      reference: `wa-${Date.now()}`,
      guestId: pathname.includes('/guests/') ? pathname.split('/')[4] : undefined,
    } as T;
  }

  if (pathname.match(/\/events\/[^/]+\/cache$/) && init?.method === 'DELETE') {
    return { status: 'ok' } as T;
  }

  throw new Error(`Mock organizer API: ruta no soportada (${pathname})`);
}

export function getEvents(page = 1, status?: EventStatus) {
  const search = new URLSearchParams({ page: String(page) });
  if (status) search.set('status', status);
  return request<PaginatedResponse<EventSummary>>(`/events?${search.toString()}`);
}

export function getEvent(id: string) {
  return request<EventDetail>(`/events/${id}`);
}

export function createEvent(payload: CreateEventPayload) {
  return request<EventDetail>('/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateEvent(eventId: string, payload: Partial<CreateEventPayload>) {
  return request<EventDetail>(`/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getEventGuests(
  id: string,
  filters?: { status?: ConfirmationState; search?: string }
) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return request<Guest[]>(`/events/${id}/guests${suffix}`);
}

export function addGuest(eventId: string, payload: GuestPayload) {
  return request<Guest>(`/events/${eventId}/guests`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function importGuests(eventId: string, payload: { csv: string }) {
  return request<GuestImportResult>(`/events/${eventId}/guests/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendInvitation(eventId: string, guestId: string) {
  return request<{ status: 'sent'; guestId: string }>(`/events/${eventId}/guests/${guestId}/send`, {
    method: 'POST',
  });
}

export function sendBulkWhatsapp(eventId: string) {
  return request<{ queued: number }>(`/events/${eventId}/whatsapp/send`, {
    method: 'POST',
  });
}

export function generateWhatsappLink(eventId: string, guestId?: string) {
  const suffix = guestId ? `/guests/${guestId}` : '';
  return request<WhatsappLink>(`/events/${eventId}${suffix}/whatsapp/link`, {
    method: 'POST',
  });
}

export function invalidateCaches(eventId: string) {
  return request<{ status: 'ok' }>(`/events/${eventId}/cache`, {
    method: 'DELETE',
  });
}

function computeMetrics(eventId: string): ConfirmationMetrics {
  const guests = MOCK_GUESTS[eventId] ?? [];
  const confirmed = guests.filter((guest) => guest.status === 'confirmed').length;
  const scanned = guests.filter((guest) => guest.status === 'scanned').length;
  const pending = guests.filter((guest) => guest.status === 'pending').length;
  const total = confirmed + scanned + pending || 1;
  return {
    confirmationRate: Number(((confirmed + scanned) / total * 100).toFixed(1)),
    averageConfirmationTimeMinutes: confirmed
      ? 180
      : 0,
    confirmedGuests: confirmed,
    scannedGuests: scanned,
    pendingGuests: pending,
  };
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
