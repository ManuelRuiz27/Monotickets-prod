import { query } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';

const CACHE_KEY_OVERVIEW = 'director:overview';
const CACHE_TTL_SECONDS = 45;
const DEFAULT_PREMIUM_FACTOR = 2;

export function createDirectorModule(options = {}) {
  const { env = process.env, logger } = options;
  const log = logger || ((payload) => console.log(JSON.stringify(payload)));
  const premiumFactor = Math.max(1, Number(env.TICKET_PREMIUM_FACTOR || DEFAULT_PREMIUM_FACTOR));

  async function assignTickets({ body = {}, requestId }) {
    const organizerId = normalizeId(body.organizerId || body.organizer_id);
    const eventId = normalizeId(body.eventId || body.event_id);
    const type = (body.type || 'prepaid').toLowerCase();
    const tickets = Number(body.tickets || 0);
    const price = Number(body.price || 0);
    const metadata = sanitizeMetadata(body.metadata);

    if (!organizerId) {
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

    const eventInfo = await loadEvent(eventId);
    if (!eventInfo) {
      return { statusCode: 404, payload: { error: 'event_not_found' } };
    }

    const equivalentTickets = computeEquivalentTickets({ tickets, eventType: eventInfo.type, premiumFactor });
    const unitPriceCents = Math.max(0, Math.round(price * 100));
    const amountCents = unitPriceCents * tickets;
    const entryType = type === 'loan' ? 'assign_loan' : 'assign_prepaid';

    const result = await query(
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

    await invalidateOverviewCache(env);

    const summary = await loadLedgerSummary(organizerId);
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
      query(
        `SELECT id, event_id, entry_type, tickets, tickets_equivalent, unit_price_cents,
                amount_cents, currency, metadata, created_at
           FROM director_ledger_entries
          WHERE organizer_id = $1
          ORDER BY created_at DESC
          LIMIT 200`,
        [id],
      ),
      loadLedgerSummary(id),
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
    const provider = body.provider || 'manual';
    const metadata = sanitizeMetadata(body.metadata) || {};

    if (!organizerId) {
      return { statusCode: 400, payload: { error: 'organizer_id_required' } };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { statusCode: 400, payload: { error: 'invalid_amount' } };
    }

    const amountCents = Math.round(amount * 100);
    const paymentResult = await query(
      `INSERT INTO payments (event_id, organizer_id, amount_cents, currency, status, provider, provider_ref, metadata, confirmed_at)
       VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7::jsonb, now())
       RETURNING id`,
      [
        eventId,
        organizerId,
        amountCents,
        currency,
        provider,
        body.providerRef || null,
        JSON.stringify({ ...metadata, requestId }),
      ],
    );

    const ledgerResult = await query(
      `INSERT INTO director_ledger_entries (
         organizer_id, event_id, entry_type, tickets, tickets_equivalent,
         unit_price_cents, amount_cents, currency, metadata
       )
       VALUES ($1, $2, 'payment', 0, 0, 0, $3, $4, $5::jsonb)
       RETURNING id, created_at`,
      [
        organizerId,
        eventId,
        amountCents,
        currency,
        JSON.stringify({ ...metadata, paymentId: paymentResult.rows[0]?.id || null }),
      ],
    );

    await invalidateOverviewCache(env);

    const summary = await loadLedgerSummary(organizerId);
    log({
      level: 'info',
      message: 'director_payment_recorded',
      payment_id: paymentResult.rows[0]?.id,
      entry_id: ledgerResult.rows[0]?.id,
      organizer_id: organizerId,
      amount_cents: amountCents,
      request_id: requestId,
    });

    return {
      statusCode: 201,
      payload: {
        paymentId: paymentResult.rows[0]?.id,
        entryId: ledgerResult.rows[0]?.id,
        status: 'confirmed',
        totals: summary,
      },
    };
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

async function loadEvent(eventId) {
  const result = await query('SELECT id, type FROM events WHERE id = $1', [eventId]);
  return result.rows[0] || null;
}

function computeEquivalentTickets({ tickets, eventType, premiumFactor }) {
  if (eventType === 'premium') {
    return Math.round(tickets * premiumFactor);
  }
  return Math.round(tickets);
}

async function loadLedgerSummary(organizerId) {
  const result = await query(
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
  return {
    ticketsEquivalent: Number(row.tickets_equivalent || 0),
    assignedAmountCents: assigned,
    paymentsCents: payments,
    balanceCents: assigned - payments,
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

async function invalidateOverviewCache(env) {
  const redis = await ensureRedis({ name: 'director-cache', env });
  await redis.del(CACHE_KEY_OVERVIEW);
}
