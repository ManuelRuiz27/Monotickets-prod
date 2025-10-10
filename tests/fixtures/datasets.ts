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

export const seeds: Seeds = {
  delivery: {
    eventId: 'demo-event',
    success: {
      phone: '+34123456789',
      template: 'ticket_confirmation',
      locale: 'es-ES',
      metadata: {
        ticketCode: 'MONO-QR-0001',
        channel: 'whatsapp',
      },
    },
    expiredWindow: {
      phone: '+34999999999',
      template: 'ticket_followup',
      locale: 'es-ES',
      metadata: {
        ticketCode: 'MONO-QR-9999',
        reason: 'window_expired',
      },
    },
    transientFailure: {
      phone: '+34111111111',
      template: 'ticket_reminder',
      locale: 'es-ES',
      metadata: {
        ticketCode: 'MONO-QR-0002',
        retryGroup: 'wa-delivery',
      },
    },
  },
  directorMetrics: {
    confirmed: 2,
    showUp: 1,
    deliveries: 3,
    lastUpdated: new Date().toISOString(),
  },
  qr: {
    valid: 'MONO-QR-0001',
    duplicate: 'MONO-QR-0001-DUP',
    invalid: 'NOT-A-QR',
    expiredEvent: 'MONO-QR-ARCHIVED',
  },
  staff: {
    token: 'STAFF-TOKEN-001',
    location: 'main-gate',
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
