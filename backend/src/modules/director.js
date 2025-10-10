import { query } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';

const CACHE_KEY_OVERVIEW = 'director:overview';
const CACHE_TTL_SECONDS = 45;

export function createDirectorModule(options = {}) {
  const { env = process.env, logger } = options;
  const log = logger || ((payload) => console.log(JSON.stringify(payload)));

  async function getOverview() {
    const redis = await ensureRedis({ name: 'director-cache', env });
    const ttl = Number(env.DIRECTOR_CACHE_TTL_SECONDS || CACHE_TTL_SECONDS);
    const cached = await redis.get(CACHE_KEY_OVERVIEW);
    if (cached) {
      return { statusCode: 200, payload: JSON.parse(cached), headers: { 'x-cache': 'hit' } };
    }

    let confirmRate;
    let timeToConfirm;
    let waSessions;
    let showUp;
    let landingVisits;
    let payments;

    try {
      confirmRate = await query(
        `SELECT coalesce(avg(confirm_rate), 0) AS confirm_rate, coalesce(sum(confirmed_count), 0) AS confirmed,
                coalesce(sum(total_guests), 0) AS guests
           FROM mv_kpi_confirm_rate`,
      );

      timeToConfirm = await query(
        `SELECT coalesce(avg(avg_seconds_to_confirm), 0) AS avg_seconds,
                coalesce(avg(median_seconds_to_confirm), 0) AS median_seconds
           FROM mv_kpi_time_to_confirm`,
      );

      waSessions = await query(
        `SELECT coalesce(avg(active_ratio), 0) AS active_ratio FROM mv_kpi_wa_sessions_ratio`,
      );

      showUp = await query(
        `SELECT coalesce(avg(show_up_rate), 0) AS show_up_rate FROM mv_kpi_show_up_rate`,
      );

      landingVisits = await query(
        `SELECT coalesce(sum(total_visits), 0) AS visits_last_30_days FROM mv_kpi_landing_visits`,
      );

      payments = await query(
        `SELECT
           coalesce(sum(CASE WHEN status IN ('confirmed', 'succeeded', 'paid') THEN amount_cents ELSE 0 END), 0) AS confirmed_amount,
           coalesce(sum(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) AS pending_amount
         FROM payments`,
      );
    } catch (error) {
      log({ level: 'error', message: 'director_overview_failed', error: error.message });
      return { statusCode: 503, payload: { error: 'overview_unavailable' } };
    }

    const overview = {
      confirmRate: Number(confirmRate.rows[0]?.confirm_rate || 0),
      confirmedGuests: Number(confirmRate.rows[0]?.confirmed || 0),
      totalGuests: Number(confirmRate.rows[0]?.guests || 0),
      averageSecondsToConfirm: Number(timeToConfirm.rows[0]?.avg_seconds || 0),
      medianSecondsToConfirm: Number(timeToConfirm.rows[0]?.median_seconds || 0),
      waSessionsRatio: Number(waSessions.rows[0]?.active_ratio || 0),
      showUpRate: Number(showUp.rows[0]?.show_up_rate || 0),
      landingVisitsLast30Days: Number(landingVisits.rows[0]?.visits_last_30_days || 0),
      confirmedRevenue: Number(payments.rows[0]?.confirmed_amount || 0) / 100,
      pendingRevenue: Number(payments.rows[0]?.pending_amount || 0) / 100,
      refreshedAt: new Date().toISOString(),
    };

    await redis.set(CACHE_KEY_OVERVIEW, JSON.stringify(overview), 'EX', ttl);

    return { statusCode: 200, payload: overview, headers: { 'x-cache': 'miss' } };
  }

  async function registerPayment({ body = {}, requestId }) {
    const amount = Number(body.amount || 0);
    const currency = (body.currency || 'mxn').toLowerCase();
    const eventId = body.eventId || null;
    const organizerId = body.organizerId || null;
    const provider = body.provider || 'manual';
    const metadata = body.metadata || {};

    if (!Number.isFinite(amount) || amount <= 0) {
      return { statusCode: 400, payload: { error: 'invalid_amount' } };
    }

    const amountCents = Math.round(amount * 100);
    const result = await query(
      `INSERT INTO payments (event_id, organizer_id, amount_cents, currency, status, provider, provider_ref, metadata, confirmed_at)
       VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7::jsonb, now())
       RETURNING id`,
      [eventId, organizerId, amountCents, currency, provider, body.providerRef || null, JSON.stringify(metadata)],
    );

    const redis = await ensureRedis({ name: 'director-cache', env });
    await redis.del(CACHE_KEY_OVERVIEW);

    log({
      level: 'info',
      message: 'director_payment_registered',
      payment_id: result.rows[0]?.id,
      amount_cents: amountCents,
      event_id: eventId,
      request_id: requestId,
    });

    return {
      statusCode: 201,
      payload: {
        paymentId: result.rows[0]?.id,
        status: 'confirmed',
      },
    };
  }

  return {
    getOverview,
    registerPayment,
  };
}
