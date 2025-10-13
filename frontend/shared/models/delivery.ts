export type GuestStatus = 'pending' | 'confirmed' | 'scanned';
export type DeliveryStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'duplicate'
  | 'retrying';

export type EventStatus = 'draft' | 'live' | 'completed';
export type LandingKind = 'standard' | 'premium';

export interface GuestModel {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: GuestStatus;
  confirmedAt?: string | null;
  scannedAt?: string | null;
  lastSentAt?: string | null;
  confirmationLink?: string | null;
  note?: string | null;
}

export interface EventSummary {
  id: string;
  name: string;
  startsAt: string;
  endsAt?: string | null;
  status: EventStatus;
  type: LandingKind;
  landingKind: LandingKind;
  landingTtlDays: number;
  description?: string;
  location?: string;
  coverUrl?: string | null;
  pdfUrl?: string | null;
  flipbookUrl?: string | null;
  landingUrl?: string | null;
  galleryUrls?: string[];
}

export interface DeliveryAttemptSummary {
  id: number;
  attempt: number;
  status: DeliveryStatus;
  providerRef?: string | null;
  error?: unknown;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface DeliveryRequestSummary {
  requestId: number;
  correlationId: string;
  eventId: string;
  guestId: string;
  organizerId: string;
  channel: 'whatsapp' | 'email' | 'pdf';
  template: string;
  currentStatus: DeliveryStatus | 'duplicate';
  attemptCount: number;
  lastProviderRef?: string | null;
  lastError?: unknown;
  createdAt: string;
  updatedAt: string;
  lastJobId?: string | null;
  latestAttempt: DeliveryAttemptSummary | null;
}
