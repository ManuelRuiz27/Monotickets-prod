export interface DeliverySeed {
  phone: string;
  template: string;
  locale: string;
  metadata: Record<string, unknown>;
}

export interface DirectorMetricsSeed {
  confirmed: number;
  showUp: number;
  deliveries: number;
  lastUpdated: string;
}

export interface QrSamples {
  valid: string;
  duplicate: string;
  invalid: string;
  expiredEvent: string;
}

export interface StaffSeed {
  token: string;
  location: string;
}

export interface DeliveryDataset {
  eventId: string;
  success: DeliverySeed;
  expiredWindow: DeliverySeed;
  transientFailure: DeliverySeed;
}

export interface Seeds {
  delivery: DeliveryDataset;
  directorMetrics: DirectorMetricsSeed;
  qr: QrSamples;
  staff: StaffSeed;
}

function envString(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const defaultEventId = envString('SCAN_EVENT_ID', 'demo-event');

export const seeds: Seeds = {
  delivery: {
    eventId: defaultEventId,
    success: {
      phone: envString('WA_SUCCESS_PHONE', '+34123456789'),
      template: envString('WA_TEMPLATE_SUCCESS', 'ticket_confirmation'),
      locale: envString('WA_TEMPLATE_LOCALE', 'es-ES'),
      metadata: {
        ticketCode: envString('SCAN_QR_VALID', 'MONO-QR-0001'),
        channel: 'whatsapp',
      },
    },
    expiredWindow: {
      phone: envString('WA_EXPIRED_PHONE', '+34999999999'),
      template: envString('WA_TEMPLATE_EXPIRED', 'ticket_followup'),
      locale: envString('WA_TEMPLATE_LOCALE', 'es-ES'),
      metadata: {
        ticketCode: envString('SCAN_QR_EXPIRED', 'MONO-QR-ARCHIVED'),
        reason: 'window_expired',
      },
    },
    transientFailure: {
      phone: envString('WA_RETRY_PHONE', '+34111111111'),
      template: envString('WA_TEMPLATE_RETRY', 'ticket_reminder'),
      locale: envString('WA_TEMPLATE_LOCALE', 'es-ES'),
      metadata: {
        ticketCode: envString('SCAN_QR_DUP', 'MONO-QR-0001-DUP'),
        retryGroup: 'wa-delivery',
      },
    },
  },
  directorMetrics: {
    confirmed: envNumber('DIRECTOR_METRIC_CONFIRMED', 2),
    showUp: envNumber('DIRECTOR_METRIC_SHOWUP', 1),
    deliveries: envNumber('DIRECTOR_METRIC_DELIVERIES', 3),
    lastUpdated: envString('DIRECTOR_METRIC_UPDATED_AT', new Date().toISOString()),
  },
  qr: {
    valid: envString('SCAN_QR_VALID', 'MONO-QR-0001'),
    duplicate: envString('SCAN_QR_DUP', 'MONO-QR-0001-DUP'),
    invalid: envString('SCAN_QR_INVALID', 'NOT-A-QR'),
    expiredEvent: envString('SCAN_QR_EXPIRED', 'MONO-QR-ARCHIVED'),
  },
  staff: {
    token: envString('STAFF_TOKEN', 'STAFF-TOKEN-001'),
    location: envString('STAFF_LOCATION', 'main-gate'),
  },
};

export interface DeliveryRoutes {
  send: string;
  logs: string;
  status: string;
  webhookProbe: string;
}

export interface DirectorRoutes {
  overview: string;
  recentChanges: string;
  confirm: string;
  invite: string;
  scanValidate: string;
}

export const deliveryRoutes: DeliveryRoutes = {
  send: process.env.DELIVERY_ROUTE_SEND || '/delivery/whatsapp/send',
  logs: process.env.DELIVERY_ROUTE_LOGS || '/delivery/logs',
  status: process.env.DELIVERY_ROUTE_STATUS || '/delivery/messages',
  webhookProbe: process.env.DELIVERY_ROUTE_WEBHOOK || '/tests/hooks/wa/messages',
};

export const directorRoutes: DirectorRoutes = {
  overview: process.env.DIRECTOR_ROUTE_OVERVIEW || '/director/overview',
  recentChanges: process.env.DIRECTOR_ROUTE_CHANGES || '/director/recent-changes',
  confirm: process.env.DIRECTOR_ROUTE_CONFIRM || '/public/confirm',
  invite: process.env.DIRECTOR_ROUTE_INVITE || '/public/invite',
  scanValidate: process.env.DIRECTOR_ROUTE_SCAN || '/scan/validate',
};
