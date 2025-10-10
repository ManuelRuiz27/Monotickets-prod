export interface KpiOverview {
  ticketsGenerated: number;
  activeCustomers: number;
  topOrganizers: { id: string; name: string; tickets: number }[];
  outstandingDebt: number;
  recentPayments: PaymentRecord[];
}

export interface OrganizerRecord {
  id: string;
  name: string;
  email: string;
  plan: string;
  ticketsGenerated: number;
  balance: number;
}

export interface PaymentRecord {
  id: string;
  organizerId: string;
  amount: number;
  currency: string;
  processedAt: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface PricingUpdatePayload {
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
  return request<KpiOverview>('/director/overview');
}

export function getDirectorOrganizers(query?: string) {
  const search = query ? `?q=${encodeURIComponent(query)}` : '';
  return request<OrganizerRecord[]>(`/director/organizers${search}`);
}

export function grantTickets(organizerId: string, amount: number) {
  return request<{ granted: number }>(
    `/director/organizers/${organizerId}/tickets/grant`,
    {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }
  );
}

export function updatePricing(
  organizerId: string,
  payload: PricingUpdatePayload
) {
  return request<OrganizerRecord>(
    `/director/organizers/${organizerId}/pricing`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export function getPayments() {
  return request<PaymentRecord[]>(`/director/payments`);
}

export function createPayment(payload: {
  organizerId: string;
  amount: number;
  currency: string;
  reference: string;
}) {
  return request<PaymentRecord>('/director/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
