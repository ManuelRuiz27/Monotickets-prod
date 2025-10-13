export type InviteTemplateKind = 'standard' | 'premium';
export type GuestStatus = 'pending' | 'confirmed' | 'scanned';

export interface EventTheme {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
}

export interface GuestSummary {
  name: string;
  status: GuestStatus;
  confirmationUrl: string;
}

export interface EventSummary {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  startDate: string;
  endDate?: string | null;
  timezone?: string | null;
  location?: string;
  coverImageUrl?: string;
  coverAlt?: string;
  logoUrl?: string;
  calendarDescription?: string;
}

export interface TemplateLinks {
  pdfUrl?: string;
  flipbookUrl?: string;
  thumbnailUrl?: string;
}

export interface InviteResponse {
  code: string;
  guest: GuestSummary;
  event: EventSummary;
  template: InviteTemplateKind;
  theme?: EventTheme;
  templateLinks?: TemplateLinks;
  qr?: {
    imageUrl: string;
    altText: string;
    instructions?: string;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const USE_MOCK = !API_BASE;

const QR_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="Código QR simulado"><rect width="80" height="80" fill="#0f172a"/><rect x="8" y="8" width="22" height="22" fill="#f8fafc"/><rect x="50" y="8" width="22" height="22" fill="#f8fafc"/><rect x="8" y="50" width="22" height="22" fill="#f8fafc"/><rect x="24" y="24" width="32" height="32" fill="#f8fafc"/></svg>`
  );

const FALLBACK_INVITES: Record<string, InviteResponse> = {
  'demo-confirmed': {
    code: 'demo-confirmed',
    guest: {
      name: 'Ada Lovelace',
      status: 'confirmed',
      confirmationUrl: '#',
    },
    event: {
      id: 'demo-event',
      title: 'Noche de Innovadores',
      subtitle: 'Celebración anual de tecnología',
      description:
        'Un encuentro íntimo para creadores, organizadores y equipos de producto. Incluye paneles, showcase y networking.',
      startDate: new Date(Date.now() + 3600 * 1000 * 48).toISOString(),
      endDate: new Date(Date.now() + 3600 * 1000 * 52).toISOString(),
      timezone: 'America/Mexico_City',
      location: 'Auditorio Reforma · CDMX',
      coverImageUrl: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
      coverAlt: 'Personas celebrando en un evento con luces azules',
      calendarDescription: 'Agenda agregada para Noche de Innovadores',
    },
    template: 'premium',
    theme: {
      primaryColor: '#6366f1',
      secondaryColor: '#312e81',
      backgroundColor: '#eef2ff',
      textColor: '#0f172a',
      accentColor: '#22c55e',
      headingFont: `'Poppins', system-ui, sans-serif`,
      bodyFont: `'Inter', system-ui, sans-serif`,
    },
    templateLinks: {
      pdfUrl: '#',
      flipbookUrl: '#',
      thumbnailUrl: 'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=400&q=60',
    },
    qr: {
      imageUrl: QR_PLACEHOLDER,
      altText: 'QR de demostración',
      instructions: 'Muestra el código desde tu dispositivo al llegar al evento.',
    },
  },
  'demo-pending': {
    code: 'demo-pending',
    guest: {
      name: 'Grace Hopper',
      status: 'pending',
      confirmationUrl: '#',
    },
    event: {
      id: 'demo-event',
      title: 'Cumbre de Datos en Vivo',
      subtitle: 'Todo sobre analítica en la industria del entretenimiento.',
      description:
        'Sesiones clave para dominar la analítica de invitados y la personalización de experiencias.',
      startDate: new Date(Date.now() + 3600 * 1000 * 96).toISOString(),
      timezone: 'America/Mexico_City',
      location: 'Foro Digital · CDMX',
    },
    template: 'standard',
  },
  'demo-scanned': {
    code: 'demo-scanned',
    guest: {
      name: 'Alan Turing',
      status: 'scanned',
      confirmationUrl: '#',
    },
    event: {
      id: 'demo-event',
      title: 'After Office Backstage',
      description: 'Networking y celebración posterior al evento principal.',
      startDate: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      endDate: new Date(Date.now() + 3600 * 1000).toISOString(),
      location: 'Sala VIP, Auditorio Reforma',
    },
    template: 'premium',
    qr: {
      imageUrl: QR_PLACEHOLDER,
      altText: 'QR utilizado (demostración)',
    },
  },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_MOCK) {
    return mockRequest<T>(path, init);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Guest API request failed (${response.status} ${response.statusText}): ${detail}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[guest-api] falling back to mock data for', path, error);
    }
    return mockRequest<T>(path, init);
  }
}

function mockRequest<T>(path: string, init?: RequestInit): T {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalizedPath, 'https://mock.monotickets.local');
  const [, resource, invitesSegment, codeSegment, extra] = url.pathname.split('/');
  if (resource !== 'guest' || invitesSegment !== 'invites' || !codeSegment) {
    throw new Error(`Mock API: ruta no soportada (${path})`);
  }
  const code = decodeURIComponent(codeSegment);
  const invite = FALLBACK_INVITES[code];
  if (!invite) {
    throw new Error(`Mock API: invitación ${code} no encontrada`);
  }

  if (!extra) {
    return deepClone(invite) as T;
  }

  if (extra === 'confirm') {
    return {
      status: 'confirmed',
      redirectUrl: `/invite/${code}/qr`,
    } as T;
  }

  if (extra === 'qr') {
    return {
      status: invite.guest.status,
      qr: invite.qr,
    } as T;
  }

  throw new Error(`Mock API: recurso ${extra} no soportado`);
}

export function getInvite(code: string) {
  return request<InviteResponse>(`/guest/invites/${encodeURIComponent(code)}`);
}

export async function getInviteLanding(code: string) {
  const invite = await getInvite(code);
  return invite;
}

export async function getTemplateLinks(code: string) {
  const invite = await getInvite(code);
  return invite.templateLinks ?? { pdfUrl: undefined, flipbookUrl: undefined };
}

export async function getLandingKind(code: string) {
  const invite = await getInvite(code);
  return invite.template;
}

export function confirmAttendance(code: string) {
  return request<{ status: GuestStatus; redirectUrl?: string }>(
    `/guest/invites/${encodeURIComponent(code)}/confirm`,
    {
      method: 'POST',
    }
  );
}

export function getInviteQr(code: string) {
  return request<{ status: GuestStatus; qr?: InviteResponse['qr'] }>(
    `/guest/invites/${encodeURIComponent(code)}/qr`
  );
}

function deepClone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
