export type EventStatus = 'draft' | 'live' | 'completed';
export type ConfirmationState = 'pending' | 'confirmed' | 'scanned';

export interface EventSummary {
  id: string;
  name: string;
  start_date: string;
  status: EventStatus;
  type: 'standard' | 'premium';
  landing_ttl_days: number;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  status: ConfirmationState;
  confirmed_at?: string | null;
  scanned_at?: string | null;
}

export interface EventDetail extends EventSummary {
  description?: string;
  location?: string;
  cover_url?: string;
  gallery_urls?: string[];
  metrics?: ConfirmationMetrics;
}

export interface ConfirmationMetrics {
  confirmationRate: number;
  averageConfirmationTimeMinutes: number;
  confirmedGuests: number;
  scannedGuests: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
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

export function createEvent(payload: Partial<EventDetail>) {
  return request<EventDetail>('/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getEventGuests(id: string) {
  return request<Guest[]>(`/events/${id}/guests`);
}

export function addGuest(eventId: string, payload: Pick<Guest, 'name' | 'email'>) {
  return request<Guest>(`/events/${eventId}/guests`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function importGuests(eventId: string, payload: { csv: string }) {
  return request<{ imported: number }>(`/events/${eventId}/guests/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sendInvitation(eventId: string, guestId: string) {
  return request<{ status: 'sent' }>(`/events/${eventId}/guests/${guestId}/send`, {
    method: 'POST',
  });
}
