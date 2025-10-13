import { createHmac, timingSafeEqual } from 'node:crypto';

import { query, withTransaction } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';

const CACHE_KEY_OVERVIEW = 'director:overview';
const CACHE_TTL_SECONDS = 45;
const DEFAULT_PREMIUM_FACTOR = 2;

class LedgerPaymentError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = 'LedgerPaymentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createDirectorModule(options = {}) {
  const { env = process.env, logger } = options;
  const log = logger || ((payload) => console.log(JSON.stringify(payload)));
  const premiumFactor = Math.max(1, Number(env.TICKET_PREMIUM_FACTOR || DEFAULT_PREMIUM_FACTOR));
  const db = {
    query: options.db?.query || ((text, params) => query(text, params)),
    withTransaction:
      options.db?.withTransaction || ((fn) => withTransaction((client) => fn({ query: client.query.bind(client) }))),
  };

  async function assignTickets({ body = {}, requestId }) {
    const organizerId = normalizeId(body.organizerId || body.organizer_id);
    const eventId = normalizeId(body.eventId || body.event_id);
    const type = (body.type || 'prepaid').toLowerCase();
    const tickets = Number(body.tickets || 0);
    const price = Number(body.price || 0);
    const metadata = sanitizeMetadata(body.metadata);

    if (!organizerId && !ledgerTicketId) {
      return { statusCode: 400, payload: { error: 'organizer_id_required' } };
    }
    if (!eventId) {
      return { statusCode: 400, payload: { error: 'event_id_required' } };
    }
    if (!['prepaid', 'loan'].includes(type)) {
      return { statusCode: 400, payload: { error: 'invalid_type' } };
    }
    if (!Number.isFinite(tickets) || tickets <= 0) {
      return { statusCode: 400, payload: { error: 'invalid_tickets' } };
    }

    const eventInfo = await loadEvent(eventId, db.query);
    if (!eventInfo) {
      return { statusCode: 404, payload: { error: 'event_not_found' } };
    }

    const equivalentTickets = computeEquivalentTickets({ tickets, eventType: eventInfo.type, premiumFactor });
    const unitPriceCents = Math.max(0, Math.round(price * 100));
    const amountCents = unitPriceCents * tickets;
    const entryType = type === 'loan' ? 'assign_loan' : 'assign_prepaid';

    const result = await db.query(
      `INSERT INTO director_ledger_entries (
         organizer_id, event_id, entry_type, tickets, tickets_equivalent,
         unit_price_cents, amount_cents, currency, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id, created_at`,
      [
        organizerId,
        eventId,
        entryType,
        tickets,
        equivalentTickets,
        unitPriceCents,
        amountCents,
        (body.currency || 'mxn').toLowerCase(),
        JSON.stringify(metadata || {}),
      ],
    );

    const unitPrice = Number.isFinite(price) ? Number(price) : 0;
    const amountDue = Math.max(0, Number((unitPrice * tickets).toFixed(2)));

    await db.query(
      `
        INSERT INTO ledger_tickets (
          organizer_id,
          event_id,
          tickets_assigned,
          tickets_used,
          tickets_type,
          unit_price_mxn,
          amount_due,
          paid,
          payment_ref
        )
        VALUES ($1, $2, $3, 0, $4, $5, $6, false, NULL)
      `,
      [
        organizerId,
        eventId,
        tickets,
        type,
        unitPrice.toFixed(2),
        amountDue.toFixed(2),
      ],
    );

    await invalidateOverviewCache(env);

    const summary = await loadLedgerSummary(organizerId, db.query);
    log({
      level: 'info',
      message: 'director_assignment_recorded',
      organizer_id: organizerId,
      event_id: eventId,
      entry_id: result.rows[0]?.id,
      tickets,
      tickets_equivalent: equivalentTickets,
      request_id: requestId,
    });

    return {
      statusCode: 201,
      payload: {
        entryId: result.rows[0]?.id,
        organizerId,
        eventId,
        tickets,
        ticketsEquivalent: equivalentTickets,
        amountCents,
        entryType,
        createdAt: result.rows[0]?.created_at,
        totals: summary,
      },
    };
  }

  async function getOrganizerLedger({ organizerId }) {
    const id = normalizeId(organizerId);
    if (!id) {
      return { statusCode: 400, payload: { error: 'organizer_id_required' } };
    }

    const [entriesResult, summary] = await Promise.all([
      db.query(
        `SELECT id, event_id, entry_type, tickets, tickets_equivalent, unit_price_cents,
                amount_cents, currency, metadata, created_at
           FROM director_ledger_entries
          WHERE organizer_id = $1
          ORDER BY created_at DESC
          LIMIT 200`,
        [id],
      ),
      loadLedgerSummary(id, db.query),
    ]);

    return {
      statusCode: 200,
      payload: {
        organizerId: id,
        totals: summary,
        entries: entriesResult.rows.map(mapLedgerEntry),
      },
    };
  }


  async function recordPayment({ body = {}, requestId }) {
    const amount = Number(body.amount || 0);
    const currency = (body.currency || 'mxn').toLowerCase();
    const eventId = normalizeId(body.eventId || body.event_id);
    const organizerId = normalizeId(body.organizerId || body.organizer_id);
    const method = normalizePaymentMethod(body.method || body.provider || 'manual');
    const metadata = sanitizeMetadata(body.metadata) || {};
    const ledgerTicketId = normalizeId(body.ledgerTicketId || body.ledger_ticket_id);
    const paymentRef = normalizeId(body.paymentRef || body.providerRef || body.payment_ref);
    const note = typeof body.note === 'string' ? body.note : undefined;

    if (!organizerId) {
      return { statusCode: 400, payload: { error: 'organizer_id_required' } };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { statusCode: 400, payload: { error: 'invalid_amount' } };
    }
    if (!ledgerTicketId && !paymentRef && !eventId) {
      return { statusCode: 400, payload: { error: 'ledger_ticket_required' } };
    }

    const amountCents = Math.round(amount * 100);
    let operationResult;

    try {
      operationResult = await db.withTransaction(async ({ query: txn }) => {
        let ledgerRow = null;

        if (ledgerTicketId) {
          const ledgerLookup = await txn(
            `SELECT * FROM ledger_tickets WHERE id = $1 FOR UPDATE`,
            [ledgerTicketId],
          );
          if (ledgerLookup.rowCount === 0) {
            throw new LedgerPaymentError('ledger_ticket_not_found', 404);
          }
          ledgerRow = ledgerLookup.rows[0];
          if (organizerId && ledgerRow.organizer_id !== organizerId) {
            throw new LedgerPaymentError('organizer_mismatch', 409);
          }
        }

        if (paymentRef) {
          const refLookup = await txn(
            `SELECT * FROM ledger_tickets WHERE payment_ref = $1 FOR UPDATE`,
            [paymentRef],
          );
          if (refLookup.rowCount > 0) {
            const existing = refLookup.rows[0];
            if (!ledgerRow) {
              ledgerRow = existing;
            }
            if (existing.paid) {
              return { duplicate: true, ledgerTicket: existing, payment: null, entry: null };
            }
          }
        }

        if (!ledgerRow) {
          if (!organizerId) {
            throw new LedgerPaymentError('organizer_id_required', 400);
          }
          const seedAmount = Number.isFinite(amount) ? amount : 0;
          const inserted = await txn(
            `
              INSERT INTO ledger_tickets (
                organizer_id,
                event_id,
                tickets_assigned,
                tickets_used,
                tickets_type,
                unit_price_mxn,
                amount_due,
                paid,
                payment_ref
              )
              VALUES ($1, $2, 0, 0, 'manual', 0, $3, false, NULL)
              RETURNING *
            `,
            [organizerId, eventId, seedAmount.toFixed(2)],
          );
          ledgerRow = inserted.rows[0];
        }

        if (ledgerRow.paid && (!paymentRef || ledgerRow.payment_ref === paymentRef)) {
          return { duplicate: true, ledgerTicket: ledgerRow, payment: null, entry: null };
        }
        if (ledgerRow.paid && paymentRef && ledgerRow.payment_ref && ledgerRow.payment_ref !== paymentRef) {
          throw new LedgerPaymentError('ledger_ticket_already_paid', 409);
        }

        const ownerId = organizerId || ledgerRow.organizer_id;

        const paymentInsert = await txn(
          `
            INSERT INTO payments (
              event_id,
              organizer_id,
              amount_cents,
              currency,
              status,
              provider,
              provider_ref,
              metadata,
              confirmed_at
            )
            VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7::jsonb, now())
            RETURNING id
          `,
          [
            eventId,
            ownerId,
            amountCents,
            currency,
            method,
            paymentRef,
            JSON.stringify({ ...metadata, requestId, ledgerTicketId: ledgerRow.id, note }),
          ],
        );

        const entryInsert = await txn(
          `
            INSERT INTO director_ledger_entries (
              organizer_id,
              event_id,
              entry_type,
              tickets,
              tickets_equivalent,
              unit_price_cents,
              amount_cents,
              currency,
              metadata
            )
            VALUES ($1, $2, 'payment', 0, 0, 0, $3, $4, $5::jsonb)
            RETURNING id, created_at
          `,
          [
            ownerId,
            eventId,
            amountCents,
            currency,
            JSON.stringify({
              ...metadata,
              paymentId: paymentInsert.rows[0]?.id || null,
            ledgerTicketId: ledgerRow.id,
            method,
            note,
          }),
          ],
        );

        const currentDue = Number(ledgerRow.amount_due || 0);
        const remainingDue = Math.max(0, Number((currentDue - amount).toFixed(2)));
        const updatedTicket = await txn(
          `
            UPDATE ledger_tickets
               SET amount_due = $1,
                   paid = $2,
                   payment_ref = COALESCE($3, payment_ref),
                   updated_at = now()
             WHERE id = $4
             RETURNING *
          `,
          [remainingDue.toFixed(2), remainingDue <= 0.01, paymentRef, ledgerRow.id],
        );

        return {
          duplicate: false,
          payment: paymentInsert.rows[0],
          entry: entryInsert.rows[0],
          ledgerTicket: updatedTicket.rows[0],
          remainingDue,
          organizerId: ownerId,
        };
      });
    } catch (error) {
      if (error instanceof LedgerPaymentError) {
        return { statusCode: error.statusCode, payload: { error: error.code } };
      }
      throw error;
    }

    if (operationResult.duplicate) {
      log({
        level: 'info',
        message: 'director_payment_recorded',
        payment_ref: paymentRef,
        amount_cents: amountCents,
        method,
        result: 'duplicate',
        organizer_id: operationResult.ledgerTicket.organizer_id,
        request_id: requestId,
      });
      return {
        statusCode: 200,
        payload: {
          status: 'duplicate',
          ledgerTicketId: operationResult.ledgerTicket.id,
          totals: await loadLedgerSummary(operationResult.ledgerTicket.organizer_id, db.query),
        },
      };
    }

    await invalidateOverviewCache(env);
    const summary = await loadLedgerSummary(operationResult.organizerId, db.query);
    const resultStatus = operationResult.remainingDue <= 0.01 ? 'applied' : 'partial';

    log({
      level: 'info',
      message: 'director_payment_recorded',
      payment_id: operationResult.payment?.id,
      entry_id: operationResult.entry?.id,
      payment_ref: paymentRef,
      amount_cents: amountCents,
      method,
      result: resultStatus,
      organizer_id: operationResult.organizerId,
      request_id: requestId,
    });

    return {
      statusCode: 201,
      payload: {
        paymentId: operationResult.payment?.id,
        entryId: operationResult.entry?.id,
        ledgerTicketId: operationResult.ledgerTicket.id,
        status: resultStatus,
        totals: summary,
      },
    };
  }


  async function handleWebhook({ body = {}, headers = {}, rawBody = '', requestId }) {
    const headerMap = normalizeHeaders(headers);
    const provider = detectWebhookProvider(headerMap, body);

    if (!provider) {
      return { statusCode: 400, payload: { error: 'unknown_provider' } };
    }

    const payloadString = typeof rawBody === 'string' && rawBody.length > 0 ? rawBody : JSON.stringify(body || {});

    if (provider === 'stripe') {
      const secret = env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        return { statusCode: 503, payload: { error: 'webhook_secret_missing' } };
      }
      if (!verifyStripeSignature(payloadString, headerMap['stripe-signature'], secret)) {
        log({ level: 'warn', message: 'director_webhook_signature_invalid', provider, request_id: requestId });
        return { statusCode: 401, payload: { error: 'invalid_signature' } };
      }
    } else if (provider === 'conekta') {
      const secret = env.CONEKTA_WEBHOOK_SECRET;
      if (!secret) {
        return { statusCode: 503, payload: { error: 'webhook_secret_missing' } };
      }
      const signature = headerMap['x-conekta-signature'] || headerMap['conekta-signature'];
      if (!verifyConektaSignature(payloadString, signature, secret)) {
        log({ level: 'warn', message: 'director_webhook_signature_invalid', provider, request_id: requestId });
        return { statusCode: 401, payload: { error: 'invalid_signature' } };
      }
    }

    let event;
    try {
      event = provider === 'stripe' ? extractStripePayment(body) : extractConektaPayment(body);
    } catch (error) {
      log({ level: 'error', message: 'director_webhook_parse_failed', provider, error: error.message, request_id: requestId });
      return { statusCode: 400, payload: { error: 'invalid_payload' } };
    }

    if (!event?.ledgerTicketId) {
      log({ level: 'info', message: 'director_webhook_missing_ledger', provider, request_id: requestId });
      return { statusCode: 202, payload: { status: 'ignored' } };
    }

    if (!event.paid) {
      log({ level: 'info', message: 'director_webhook_pending', provider, request_id: requestId, payment_ref: event.paymentRef });
      return { statusCode: 202, payload: { status: 'pending' } };
    }

    const paymentResponse = await recordPayment({
      body: {
        amount: event.amount,
        currency: event.currency,
        eventId: event.eventId,
        organizerId: event.organizerId,
        ledgerTicketId: event.ledgerTicketId,
        paymentRef: event.paymentRef,
        method: provider,
        metadata: { ...(event.metadata || {}), provider, source: 'webhook' },
      },
      requestId,
    });

    return paymentResponse;
  }

  async function getOverview() {
    const redis = await ensureRedis({ name: 'director-cache', env });
    const ttl = Number(env.DIRECTOR_CACHE_TTL_SECONDS || CACHE_TTL_SECONDS);
    const cached = await redis.get(CACHE_KEY_OVERVIEW);
    if (cached) {
      return { statusCode: 200, payload: JSON.parse(cached), headers: { 'x-cache': 'hit' } };
    }

    try {
      const [tickets, debt, topOrganizers] = await Promise.all([
        query(
          `SELECT COALESCE(SUM(tickets_equivalentes), 0) AS tickets_equivalentes,
                  COALESCE(SUM(valor_asignado_cents), 0) AS valor_asignado_cents
             FROM mv_kpi_tickets_entregados`,
        ),
        query(
          `SELECT COALESCE(SUM(balance_cents), 0) AS balance_cents
             FROM mv_kpi_deuda_abierta`,
        ),
        query(
          `SELECT organizer_id, tickets_equivalentes, valor_asignado_cents, ranking
             FROM mv_kpi_top_organizadores
             ORDER BY ranking ASC
             LIMIT 10`,
        ),
      ]);

      const overview = {
        ticketsEquivalentDelivered: Number(tickets.rows[0]?.tickets_equivalentes || 0),
        assignedValueCents: Number(tickets.rows[0]?.valor_asignado_cents || 0),
        openDebtCents: Number(debt.rows[0]?.balance_cents || 0),
        topOrganizers: topOrganizers.rows.map((row) => ({
          organizerId: row.organizer_id,
          ticketsEquivalent: Number(row.tickets_equivalentes || 0),
          assignedValueCents: Number(row.valor_asignado_cents || 0),
          rank: Number(row.ranking || 0),
        })),
        refreshedAt: new Date().toISOString(),
      };

      await redis.set(CACHE_KEY_OVERVIEW, JSON.stringify(overview), 'EX', ttl);

      return { statusCode: 200, payload: overview, headers: { 'x-cache': 'miss' } };
    } catch (error) {
      log({ level: 'error', message: 'director_overview_failed', error: error.message });
      return { statusCode: 503, payload: { error: 'overview_unavailable' } };
    }
  }

  async function registerPayment(options) {
    return recordPayment(options);
  }

  return {
    assignTickets,
    getOrganizerLedger,
    recordPayment,
    registerPayment,
    handleWebhook,
    getOverview,
  };
}

function normalizeId(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    return null;
  }
}

async function loadEvent(eventId, runQuery = query) {
  const result = await runQuery('SELECT id, type FROM events WHERE id = $1', [eventId]);
  return result.rows[0] || null;
}

function computeEquivalentTickets({ tickets, eventType, premiumFactor }) {
  if (eventType === 'premium') {
    return Math.round(tickets * premiumFactor);
  }
  return Math.round(tickets);
}

function normalizePaymentMethod(method) {
  if (typeof method !== 'string') {
    return 'manual';
  }
  const normalized = method.trim().toLowerCase();
  if (!normalized) {
    return 'manual';
  }
  if (['manual', 'stripe', 'conekta', 'webhook'].includes(normalized)) {
    return normalized;
  }
  return normalized;
}

async function loadLedgerSummary(organizerId, runQuery = query) {
  const result = await runQuery(
    `SELECT
        COALESCE(SUM(CASE WHEN entry_type IN ('assign_prepaid', 'assign_loan') THEN tickets_equivalent ELSE 0 END), 0) AS tickets_equivalent,
        COALESCE(SUM(CASE WHEN entry_type IN ('assign_prepaid', 'assign_loan') THEN amount_cents ELSE 0 END), 0) AS assigned_amount_cents,
        COALESCE(SUM(CASE WHEN entry_type = 'payment' THEN amount_cents ELSE 0 END), 0) AS payments_cents
       FROM director_ledger_entries
      WHERE organizer_id = $1`,
    [organizerId],
  );

  const row = result.rows[0] || {};
  const assigned = Number(row.assigned_amount_cents || 0);
  const payments = Number(row.payments_cents || 0);
  const ledgerTickets = await runQuery(
    `SELECT COALESCE(SUM(amount_due), 0) AS amount_due
       FROM ledger_tickets
      WHERE organizer_id = $1
        AND paid = false`,
    [organizerId],
  );
  const outstandingMx = Number(ledgerTickets.rows[0]?.amount_due || 0);
  return {
    ticketsEquivalent: Number(row.tickets_equivalent || 0),
    assignedAmountCents: assigned,
    paymentsCents: payments,
    balanceCents: assigned - payments,
    outstandingAmountMXN: Number(outstandingMx.toFixed(2)),
  };
}

function mapLedgerEntry(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    entryType: row.entry_type,
    tickets: Number(row.tickets || 0),
    ticketsEquivalent: Number(row.tickets_equivalent || 0),
    unitPriceCents: Number(row.unit_price_cents || 0),
    amountCents: Number(row.amount_cents || 0),
    currency: row.currency,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    normalized[lower] = Array.isArray(value) ? value[0] : value;
  }
  return normalized;
}

function detectWebhookProvider(headers = {}, body = {}) {
  if (headers['stripe-signature']) {
    return 'stripe';
  }
  if (headers['x-conekta-signature'] || headers['conekta-signature']) {
    return 'conekta';
  }
  if (typeof body?.provider === 'string') {
    const normalized = body.provider.toLowerCase();
    if (normalized === 'stripe' || normalized === 'conekta') {
      return normalized;
    }
  }
  return null;
}

function verifyStripeSignature(rawPayload, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }
  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(',')
      .map((segment) => segment.split('='))
      .filter((segment) => segment.length === 2),
  );
  const timestamp = parts.t;
  const expectedSignature = parts.v1;
  if (!timestamp || !expectedSignature) {
    return false;
  }
  const payload = `${timestamp}.${rawPayload}`;
  const digest = createHmac('sha256', secret).update(payload).digest('hex');
  const provided = Buffer.from(expectedSignature, 'hex');
  const computed = Buffer.from(digest, 'hex');
  if (provided.length !== computed.length) {
    return false;
  }
  return timingSafeEqual(provided, computed);
}

function verifyConektaSignature(rawPayload, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }
  const digest = createHmac('sha256', secret).update(rawPayload).digest('hex');
  const provided = Buffer.from(String(signatureHeader), 'hex');
  const computed = Buffer.from(digest, 'hex');
  if (provided.length !== computed.length) {
    return false;
  }
  return timingSafeEqual(provided, computed);
}

function extractStripePayment(payload = {}) {
  const object = payload?.data?.object || {};
  const metadata = object.metadata || {};
  const ledgerTicketId = normalizeId(metadata.ledger_ticket_id || metadata.ledgerTicketId);
  const organizerId = normalizeId(metadata.organizer_id || metadata.organizerId);
  const eventId = normalizeId(metadata.event_id || metadata.eventId);
  const amountRaw = Number(object.amount_received ?? object.amount ?? 0);
  const amount = Number((amountRaw / 100).toFixed(2));
  const status = String(object.status || payload.type || '').toLowerCase();
  const paymentRef = object.id || payload.data?.id || null;
  const paid =
    status === 'succeeded' ||
    status === 'paid' ||
    status === 'completed' ||
    payload.type === 'payment_intent.succeeded';
  return {
    ledgerTicketId,
    organizerId,
    eventId,
    amount,
    currency: (object.currency || 'mxn').toLowerCase(),
    paymentRef,
    paid,
    metadata,
  };
}

function extractConektaPayment(payload = {}) {
  const data = payload?.data?.object || payload?.data || payload || {};
  const metadata = data.metadata || {};
  const charges = Array.isArray(data?.charges?.data) ? data.charges.data : [];
  const charge = charges[0] || {};
  const ledgerTicketId = normalizeId(metadata.ledger_ticket_id || metadata.ledgerTicketId);
  const organizerId = normalizeId(metadata.organizer_id || metadata.organizerId);
  const eventId = normalizeId(metadata.event_id || metadata.eventId);
  const amountRaw = Number(data.amount ?? charge.amount ?? data.amount_paid ?? 0);
  const amount = Number((amountRaw / 100).toFixed(2));
  const status = String(data.status || charge.status || payload.type || '').toLowerCase();
  const paid = ['paid', 'succeeded', 'completed'].includes(status);
  return {
    ledgerTicketId,
    organizerId,
    eventId,
    amount,
    currency: (data.currency || charge.currency || 'mxn').toLowerCase(),
    paymentRef: charge.payment_method?.reference || data.id || charge.id || null,
    paid,
    metadata,
  };
}

async function invalidateOverviewCache(env) {
  if (String(env?.DIRECTOR_CACHE_DISABLE || '').toLowerCase() === 'true') {
    return;
  }
  try {
    const redis = await ensureRedis({ name: 'director-cache', env });
    await redis.del(CACHE_KEY_OVERVIEW);
  } catch (error) {
    // Swallow cache errors in non-critical paths (e.g., unit tests)
    if (env?.NODE_ENV !== 'test') {
      console.warn('[director] cache invalidation skipped:', error.message);
    }
  }
}
