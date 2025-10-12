export interface DirectorOverview {
  eventsByType: {
    standard: number;
    premium: number;
  };
  activeOrganizers: number;
  ticketsGenerated: number;
  updatedAt: string;
}

export interface OrganizerRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  plan: string;
  ticketsGenerated: number;
  outstandingBalance: number;
  currency: string;
  pricePerTicket?: number;
}

export interface ReceivableRecord {
  organizerId: string;
  organizerName: string;
  amount: number;
  currency: string;
  agingBucket: '0-30' | '31-60' | '61-90' | '90+';
  lastPaymentAt?: string;
  lastMovementNote?: string;
}

export interface GrantPayload {
  type: 'prepaid' | 'loan';
  tickets: number;
  reference?: string;
}

export interface PaymentPayload {
  amount: number;
  currency: string;
  paidAt: string;
  note?: string;
}

export interface PricingPayload {
  price: number;
  currency: string;
}

const API_BASE =
  process.env.DASHBOARD_NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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

export function getDirectorOverview() {
  return request<DirectorOverview>('/director/overview');
}

export function getDirectorOrganizers(query?: string) {
  const search = query ? `?q=${encodeURIComponent(query)}` : '';
  return request<OrganizerRecord[]>(`/director/organizers${search}`);
}

export function grantTickets(organizerId: string, payload: GrantPayload) {
  return request<{ granted: number }>(`/director/organizers/${organizerId}/tickets`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function recordPayment(organizerId: string, payload: PaymentPayload) {
  return request<{ balance: number }>(`/director/organizers/${organizerId}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePricing(organizerId: string, payload: PricingPayload) {
  return request<OrganizerRecord>(`/director/organizers/${organizerId}/pricing`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getReceivables(aging?: ReceivableRecord['agingBucket']) {
  const query = aging ? `?aging=${encodeURIComponent(aging)}` : '';
  return request<ReceivableRecord[]>(`/director/receivables${query}`);
}
