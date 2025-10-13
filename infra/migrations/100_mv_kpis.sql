BEGIN;

DROP MATERIALIZED VIEW IF EXISTS mv_confirmation_rate_daily;
CREATE MATERIALIZED VIEW mv_confirmation_rate_daily
AS
WITH daily_counts AS (
    SELECT
        g.event_id,
        e.type AS event_type,
        date_trunc('day', g.created_at) AS day,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE g.status IN ('confirmed', 'scanned')) AS confirmed
    FROM guests g
    JOIN events e ON e.id = g.event_id
    GROUP BY g.event_id, e.type, date_trunc('day', g.created_at)
)
SELECT
    event_id,
    event_type,
    day,
    total,
    confirmed,
    CASE WHEN total = 0 THEN 0 ELSE confirmed::numeric / total::numeric END AS confirmation_rate
FROM daily_counts
WITH NO DATA;

DROP MATERIALIZED VIEW IF EXISTS mv_show_up_rate_daily;
CREATE MATERIALIZED VIEW mv_show_up_rate_daily
AS
WITH confirmed_counts AS (
    SELECT event_id, COUNT(*) FILTER (WHERE status IN ('confirmed', 'scanned')) AS confirmed
    FROM guests
    GROUP BY event_id
),
scanned_daily AS (
    SELECT
        sl.event_id,
        date_trunc('day', sl.ts) AS day,
        COUNT(DISTINCT sl.guest_id) FILTER (WHERE sl.result = 'valid') AS scanned
    FROM scan_logs sl
    WHERE sl.result = 'valid'
    GROUP BY sl.event_id, date_trunc('day', sl.ts)
)
SELECT
    sd.event_id,
    sd.day,
    cc.confirmed,
    COALESCE(sd.scanned, 0) AS scanned,
    CASE WHEN cc.confirmed = 0 THEN 0 ELSE COALESCE(sd.scanned, 0)::numeric / cc.confirmed::numeric END AS show_up_rate
FROM scanned_daily sd
JOIN confirmed_counts cc ON cc.event_id = sd.event_id
WITH NO DATA;

DROP MATERIALIZED VIEW IF EXISTS mv_wa_free_ratio_daily;
CREATE MATERIALIZED VIEW mv_wa_free_ratio_daily
AS
WITH whatsapp_logs AS (
    SELECT
        dr.event_id,
        dr.guest_id,
        dl.created_at,
        date_trunc('day', dl.created_at) AS day,
        MIN(dl.created_at) OVER (PARTITION BY dr.event_id, dr.guest_id) AS first_contact
    FROM delivery_logs dl
    JOIN delivery_requests dr ON dr.id = dl.request_id
    WHERE dr.channel = 'whatsapp'
      AND dl.status IN ('sent', 'delivered')
),
classified AS (
    SELECT
        event_id,
        day,
        COUNT(*) FILTER (WHERE created_at <= first_contact + interval '24 hours') AS free_sessions,
        COUNT(*) FILTER (WHERE created_at > first_contact + interval '24 hours') AS paid_templates
    FROM whatsapp_logs
    GROUP BY event_id, day
)
SELECT
    event_id,
    day,
    free_sessions,
    paid_templates,
    CASE
        WHEN (free_sessions + paid_templates) = 0 THEN 0
        ELSE free_sessions::numeric / (free_sessions + paid_templates)::numeric
    END AS wa_free_ratio,
    'heuristic_24h_window'::text AS assumption
FROM classified
WITH NO DATA;

DROP MATERIALIZED VIEW IF EXISTS mv_event_mix_90d;
CREATE MATERIALIZED VIEW mv_event_mix_90d
AS
WITH bounds AS (
    SELECT
        date_trunc('day', now()) - interval '89 days' AS start_day,
        date_trunc('day', now()) AS end_day
),
dates AS (
    SELECT generate_series(start_day, end_day, interval '1 day') AS day
    FROM bounds
),
events_window AS (
    SELECT
        e.id,
        e.type,
        date_trunc('day', e.starts_at) AS day
    FROM events e
    JOIN bounds b ON e.starts_at >= b.start_day AND e.starts_at <= b.end_day + interval '1 day'
),
guests_per_event AS (
    SELECT event_id, COUNT(*) AS guests_count
    FROM guests
    GROUP BY event_id
),
agg AS (
    SELECT
        d.day,
        ew.type,
        COUNT(ew.id) AS events_count,
        COALESCE(SUM(gp.guests_count), 0) AS guests_count
    FROM dates d
    LEFT JOIN events_window ew ON ew.day = d.day
    LEFT JOIN guests_per_event gp ON gp.event_id = ew.id
    GROUP BY d.day, ew.type
)
SELECT
    day,
    type,
    events_count,
    guests_count
FROM agg
WHERE type IS NOT NULL
WITH NO DATA;

DROP MATERIALIZED VIEW IF EXISTS mv_organizer_debt;
CREATE MATERIALIZED VIEW mv_organizer_debt
AS
WITH ledger_totals AS (
    SELECT
        organizer_id,
        SUM(CASE WHEN kind = 'prepago' THEN tickets ELSE 0 END) AS prepaid_tickets,
        SUM(CASE WHEN kind = 'prestamo' THEN tickets ELSE 0 END) AS loan_tickets,
        SUM(CASE WHEN kind = 'prestamo' THEN tickets * unit_price ELSE 0 END) AS loan_value,
        SUM(CASE WHEN kind = 'prepago' THEN tickets * unit_price ELSE 0 END) AS prepaid_value
    FROM ticket_ledger
    GROUP BY organizer_id
),
payment_totals AS (
    SELECT
        organizer_id,
        SUM(amount) AS payments_total,
        MAX(created_at) AS last_payment_at
    FROM payments
    GROUP BY organizer_id
)
SELECT
    o.id AS organizer_id,
    COALESCE(lt.prepaid_tickets, 0) AS prepaid_tickets,
    COALESCE(lt.loan_tickets, 0) AS loan_tickets,
    COALESCE(lt.loan_value, 0) - COALESCE(pt.payments_total, 0) AS open_debt,
    pt.last_payment_at
FROM organizers o
LEFT JOIN ledger_totals lt ON lt.organizer_id = o.id
LEFT JOIN payment_totals pt ON pt.organizer_id = o.id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_confirmation_rate_daily_idx ON mv_confirmation_rate_daily (event_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS mv_show_up_rate_daily_idx ON mv_show_up_rate_daily (event_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS mv_wa_free_ratio_daily_idx ON mv_wa_free_ratio_daily (event_id, day);
CREATE UNIQUE INDEX IF NOT EXISTS mv_event_mix_90d_idx ON mv_event_mix_90d (day, type);
CREATE UNIQUE INDEX IF NOT EXISTS mv_organizer_debt_idx ON mv_organizer_debt (organizer_id);

REFRESH MATERIALIZED VIEW mv_confirmation_rate_daily;
REFRESH MATERIALIZED VIEW mv_show_up_rate_daily;
REFRESH MATERIALIZED VIEW mv_wa_free_ratio_daily;
REFRESH MATERIALIZED VIEW mv_event_mix_90d;
REFRESH MATERIALIZED VIEW mv_organizer_debt;

COMMIT;
