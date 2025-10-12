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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
