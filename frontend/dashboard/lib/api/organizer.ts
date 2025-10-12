export type EventStatus = 'draft' | 'live' | 'completed';
export type ConfirmationState = 'pending' | 'confirmed' | 'scanned';
export type LandingKind = 'standard' | 'premium';

export interface EventSummary {
  id: string;
  name: string;
  start_date: string;
  end_date?: string | null;
  status: EventStatus;
  type: LandingKind;
  landing_kind: LandingKind;
  landing_ttl_days: number;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: ConfirmationState;
  confirmed_at?: string | null;
  scanned_at?: string | null;
  last_sent_at?: string | null;
  confirmation_link?: string;
}

export interface EventDetail extends EventSummary {
  description?: string;
  location?: string;
  cover_url?: string;
  pdf_url?: string;
  flipbook_url?: string;
  landing_url?: string;
  metrics?: ConfirmationMetrics;
  whatsapp_template?: string;
}

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
  start_date: string;
  end_date?: string;
  type: LandingKind;
  cover_url?: string;
  pdf_url?: string;
  flipbook_url?: string;
  landing_url?: string;
  landing_ttl_days: number;
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

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
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
    const detail = await res.text();
    throw new Error(`Request failed: ${res.status} ${res.statusText} ${detail}`);
  }
  return res.json() as Promise<T>;
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
