import { randomUUID } from 'node:crypto';

import { query } from '../db/index.js';

const SUPPORTED_PROVIDERS = new Set(['stripe', 'conekta', 'mock']);

export function createPaymentsModule(options = {}) {
  const { env = process.env, queuesPromise, logger } = options;
  if (!queuesPromise) {
    throw new Error('queuesPromise is required for payments module');
  }
  const log = logger || ((payload) => console.log(JSON.stringify(payload)));

  async function createIntent({ body = {}, requestId }) {
    const amount = Number(body.amount || 0);
    const currency = (body.currency || 'mxn').toLowerCase();
    const eventId = body.eventId || null;
    const organizerId = body.organizerId || env.DEFAULT_ORGANIZER_ID || null;
    const provider = selectProvider(body.provider || env.PAYMENTS_PROVIDER || 'mock');
    const metadata = { ...(body.metadata || {}) };

    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        statusCode: 400,
        payload: { error: 'invalid_amount' },
      };
    }

    const amountCents = Math.round(amount * 100);
    const paymentId = randomUUID();
    let providerRef = `pi_${paymentId}`;
    let clientSecret = `secret_${paymentId}`;
    let status = 'requires_confirmation';

    try {
      if (provider === 'stripe' && env.STRIPE_SECRET_KEY) {
        const response = await createStripeIntent({ amountCents, currency, env, metadata, paymentId });
        providerRef = response.providerRef;
        clientSecret = response.clientSecret;
        status = response.status;
      } else if (provider === 'conekta' && env.CONEKTA_API_KEY) {
        const response = await createConektaOrder({ amountCents, currency, env, metadata, paymentId });
        providerRef = response.providerRef;
        clientSecret = response.clientSecret;
        status = response.status;
      } else {
        log({ level: 'warn', message: 'payments_provider_mock_mode', provider, request_id: requestId });
      }
    } catch (error) {
      log({ level: 'error', message: 'payments_provider_error', error: error.message, provider, request_id: requestId });
      status = 'requires_confirmation';
    }

    metadata.payment_id = paymentId;

    await query(
      `INSERT INTO payments (
         id, event_id, organizer_id, amount_cents, currency, status, provider, provider_ref, metadata, client_secret
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      `,
      [
        paymentId,
        eventId,
        organizerId,
        amountCents,
        currency,
        status,
        provider,
        providerRef,
        JSON.stringify(metadata),
        clientSecret,
      ],
    );

    log({
      level: 'info',
      message: 'payment_intent_created',
      payment_id: paymentId,
      provider,
      amount_cents: amountCents,
      event_id: eventId,
      request_id: requestId,
    });

    return {
      statusCode: 201,
      payload: {
        paymentId,
        provider,
        providerRef,
        clientSecret,
        status,
      },
    };
  }

  async function enqueueWebhook({ body = {}, headers = {}, requestId }) {
    const queues = await queuesPromise;
    const provider = selectProvider(body?.provider || env.PAYMENTS_PROVIDER || 'mock');
    const jobPayload = {
      webhookId: randomUUID(),
      provider,
      payload: body,
      headers,
      receivedAt: new Date().toISOString(),
      requestId,
    };

    let job;
    try {
      job = await queues.paymentsQueue.add('payments-webhook', jobPayload, {
        attempts: 5,
        backoff: { type: 'exponential', delay: Number(env.PAYMENTS_WEBHOOK_BACKOFF_MS || 3000) },
        removeOnComplete: true,
        removeOnFail: false,
      });
    } catch (error) {
      log({ level: 'error', message: 'payments_enqueue_failed', error: error.message, provider, request_id: requestId });
      return {
        statusCode: 503,
        payload: { error: 'webhook_unavailable' },
      };
    }

    log({ level: 'info', message: 'payments_webhook_enqueued', job_id: job.id, request_id: requestId });

    return {
      statusCode: 200,
      payload: { ok: true, jobId: job.id },
    };
  }

  return {
    createIntent,
    enqueueWebhook,
  };
}

function selectProvider(input) {
  const normalized = String(input || '').toLowerCase();
  if (SUPPORTED_PROVIDERS.has(normalized)) {
    return normalized;
  }
  return 'mock';
}

async function createStripeIntent({ amountCents, currency, env, metadata, paymentId }) {
  const params = new URLSearchParams();
  params.append('amount', String(amountCents));
  params.append('currency', currency);
  params.append('automatic_payment_methods[enabled]', 'true');
  params.append('metadata[payment_id]', paymentId);
  Object.entries(metadata || {}).forEach(([key, value]) => {
    params.append(`metadata[${key}]`, typeof value === 'string' ? value : JSON.stringify(value));
  });

  const response = await fetch(env.STRIPE_API_URL || 'https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new Error(`Stripe error: ${response.status} ${errorPayload}`);
  }

  const payload = await response.json();
  return {
    providerRef: payload.id,
    clientSecret: payload.client_secret,
    status: payload.status || 'requires_confirmation',
  };
}

async function createConektaOrder({ amountCents, currency, env, metadata, paymentId }) {
  const response = await fetch(env.CONEKTA_API_URL || 'https://api.conekta.io/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.CONEKTA_API_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'es',
    },
    body: JSON.stringify({
      currency,
      customer_info: metadata.customer_info || {},
      line_items: metadata.line_items || [
        {
          name: metadata.description || 'Event Payment',
          unit_price: amountCents,
          quantity: 1,
        },
      ],
      metadata: { ...metadata, payment_id: paymentId },
      charges: metadata.charges || [
        {
          amount: amountCents,
          payment_method: { type: 'default' },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new Error(`Conekta error: ${response.status} ${errorPayload}`);
  }

  const payload = await response.json();
  const charge = Array.isArray(payload.charges?.data) ? payload.charges.data[0] : null;
  return {
    providerRef: charge?.payment_method?.reference || payload.id,
    clientSecret: charge?.payment_method?.service_name || `conekta_${paymentId}`,
    status: charge?.status || payload.payment_status || 'pending',
  };
}
