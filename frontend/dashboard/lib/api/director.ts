import { handleError } from '@shared/api/errors';

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
  balance?: number;
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

export interface PaymentRecord {
  id: string;
  organizerId: string;
  organizerName: string;
  amount: number;
  currency: string;
  reference: string;
  status: 'recibido' | 'aplicado';
  createdAt: string;
}

export interface KpiOverview {
  ticketsGenerated: number;
  activeCustomers: number;
  outstandingDebt: number;
  recentPayments: PaymentRecord[];
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

export type PricingUpdatePayload = PricingPayload;

const API_BASE =
  process.env.DASHBOARD_NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  '';

const USE_MOCK = !API_BASE;

const MOCK_OVERVIEW: DirectorOverview = {
  eventsByType: {
    standard: 12,
    premium: 5,
  },
  activeOrganizers: 8,
  ticketsGenerated: 4380,
  updatedAt: new Date().toISOString(),
};

const MOCK_ORGANIZERS: OrganizerRecord[] = [
  {
    id: 'org-aurora',
    name: 'Experiencias Aurora',
    email: 'gerencia@aurora.mx',
    phone: '+52 55 1000 0001',
    plan: 'Premium',
    ticketsGenerated: 1820,
    outstandingBalance: 12500,
    currency: 'MXN',
    pricePerTicket: 9.5,
    balance: 12500,
  },
  {
    id: 'org-momentum',
    name: 'Momentum Eventos',
    email: 'hola@momentum.mx',
    phone: '+52 33 9000 0002',
    plan: 'Standard',
    ticketsGenerated: 980,
    outstandingBalance: 0,
    currency: 'MXN',
    pricePerTicket: 7.5,
    balance: 0,
  },
  {
    id: 'org-summit',
    name: 'Summit Riviera',
    email: 'contacto@summit.mx',
    plan: 'Growth',
    ticketsGenerated: 620,
    outstandingBalance: 4200,
    currency: 'MXN',
    balance: 4200,
  },
];

const MOCK_RECEIVABLES: ReceivableRecord[] = [
  {
    organizerId: 'org-aurora',
    organizerName: 'Experiencias Aurora',
    amount: 8200,
    currency: 'MXN',
    agingBucket: '31-60',
    lastPaymentAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 22).toISOString(),
    lastMovementNote: 'Liquidó preventa parcial',
  },
  {
    organizerId: 'org-summit',
    organizerName: 'Summit Riviera',
    amount: 4200,
    currency: 'MXN',
    agingBucket: '0-30',
    lastPaymentAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
  },
];

const MOCK_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay-001',
    organizerId: 'org-aurora',
    organizerName: 'Experiencias Aurora',
    amount: 7500,
    currency: 'MXN',
    reference: 'FACT-2024-021',
    status: 'aplicado',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
  },
  {
    id: 'pay-002',
    organizerId: 'org-momentum',
    organizerName: 'Momentum Eventos',
    amount: 3200,
    currency: 'MXN',
    reference: 'FACT-2024-014',
    status: 'recibido',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK) {
    return mockRequest<T>(path, init);
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      await handleError(res, { scope: 'director-api', request: path });
    }
    return res.json() as Promise<T>;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[director-api] usando datos mock para', path, error);
    }
    return mockRequest<T>(path, init);
  }
}

function mockRequest<T>(path: string, init?: RequestInit): T {
  const url = new URL(path, 'https://mock.monotickets.local');
  const { pathname, searchParams } = url;

  if (pathname === '/director/overview') {
    return clone(MOCK_OVERVIEW) as T;
  }

  if (pathname === '/director/organizers') {
    const query = (searchParams.get('q') ?? '').toLowerCase();
    const filtered = query
      ? MOCK_ORGANIZERS.filter((organizer) =>
          [organizer.name, organizer.email, organizer.phone].some((field) =>
            (field ?? '').toLowerCase().includes(query)
          )
        )
      : MOCK_ORGANIZERS;
    return clone(filtered) as T;
  }

  if (pathname.startsWith('/director/organizers/') && pathname.endsWith('/tickets')) {
    return { granted: 100 } as T;
  }

  if (pathname.startsWith('/director/organizers/') && pathname.endsWith('/payments')) {
    return { balance: 0 } as T;
  }

  if (pathname.startsWith('/director/organizers/') && pathname.endsWith('/pricing')) {
    const organizerId = pathname.split('/')[3];
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    const organizer = MOCK_ORGANIZERS.find((item) => item.id === organizerId);
    if (organizer && typeof payload.price === 'number') {
      organizer.pricePerTicket = payload.price;
    }
    return clone(organizer ?? MOCK_ORGANIZERS[0]) as T;
  }

  if (pathname === '/director/receivables') {
    const bucket = searchParams.get('aging') as ReceivableRecord['agingBucket'] | null;
    const filtered = bucket ? MOCK_RECEIVABLES.filter((item) => item.agingBucket === bucket) : MOCK_RECEIVABLES;
    return clone(filtered) as T;
  }

  if (pathname === '/director/payments' && (!init?.method || init.method === 'GET')) {
    return clone(MOCK_PAYMENTS) as T;
  }

  if (pathname === '/director/payments' && init?.method === 'POST') {
    const payload = init.body ? JSON.parse(String(init.body)) : {};
    const organizer = MOCK_ORGANIZERS.find((item) => item.id === payload.organizerId);
    const record: PaymentRecord = {
      id: `pay-${Date.now()}`,
      organizerId: payload.organizerId ?? 'organizador-demo',
      organizerName: organizer?.name ?? 'Organizador demo',
      amount: Number(payload.amount ?? 0),
      currency: payload.currency ?? 'MXN',
      reference: payload.reference ?? `REF-${Date.now()}`,
      status: 'recibido',
      createdAt: new Date().toISOString(),
    };
    MOCK_PAYMENTS.unshift(record);
    return clone(record) as T;
  }

  if (pathname === '/director/kpis') {
    const outstanding = MOCK_RECEIVABLES.reduce((sum, item) => sum + item.amount, 0);
    const overview: KpiOverview = {
      ticketsGenerated: MOCK_OVERVIEW.ticketsGenerated,
      activeCustomers: MOCK_ORGANIZERS.length,
      outstandingDebt: outstanding,
      recentPayments: MOCK_PAYMENTS.slice(0, 4),
    };
    return clone(overview) as T;
  }

  throw new Error(`Mock director API: ruta no soportada (${pathname})`);
}

export function getDirectorOverview() {
  return request<DirectorOverview>('/director/overview');
}

export function getDirectorOrganizers(query?: string) {
  const search = query ? `?q=${encodeURIComponent(query)}` : '';
  return request<OrganizerRecord[]>(`/director/organizers${search}`);
}

export function getKpiOverview() {
  return request<KpiOverview>('/director/kpis');
}

export function grantTickets(organizerId: string, payload: GrantPayload | number) {
  const body = typeof payload === 'number' ? { type: 'prepaid', tickets: payload } : payload;
  return request<{ granted: number }>(`/director/organizers/${organizerId}/tickets`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getPayments() {
  return request<PaymentRecord[]>('/director/payments');
}

export function createPayment(payload: { organizerId: string; amount: number; currency: string; reference: string }) {
  return request<PaymentRecord>('/director/payments', {
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

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
