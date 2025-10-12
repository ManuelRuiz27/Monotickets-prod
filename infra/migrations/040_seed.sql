WITH constants AS (
    SELECT
        date_trunc('month', now()) AS current_month_start,
        date_trunc('month', now()) - interval '1 month' AS previous_month_start
),
organizer_seed AS (
    INSERT INTO organizers (name, contact, pricing)
    VALUES
        (
            'Experiencias Aurora',
            jsonb_build_object('email', 'contacto@aurora.mx', 'phone', '+52-55-1000-0001'),
            jsonb_build_object('standard_ticket_price', 5.00, 'premium_ticket_price', 9.50)
        ),
        (
            'Momentum Eventos',
            jsonb_build_object('email', 'hola@momentum.mx', 'phone', '+52-33-9000-0002'),
            jsonb_build_object('standard_ticket_price', 3.50, 'premium_ticket_price', 7.50)
        )
    RETURNING id, name
),
event_seed AS (
    INSERT INTO events (organizer_id, name, type, status, starts_at, ends_at)
    VALUES
        (
            (SELECT id FROM organizer_seed WHERE name = 'Experiencias Aurora'),
            'Gala Innovación 2024',
            'standard',
            'active',
            date_trunc('hour', now() - interval '10 days') + interval '18 hours',
            date_trunc('hour', now() - interval '9 days') + interval '2 hours'
        ),
        (
            (SELECT id FROM organizer_seed WHERE name = 'Momentum Eventos'),
            'Summit Premium Riviera',
            'premium',
            'active',
            date_trunc('hour', now() + interval '15 days') + interval '10 hours',
            date_trunc('hour', now() + interval '15 days') + interval '18 hours'
        )
    RETURNING id, organizer_id, type, name,
        ROW_NUMBER() OVER (ORDER BY starts_at) AS event_idx
),
guest_blueprint AS (
    SELECT
        e.id AS event_id,
        e.organizer_id,
        e.type,
        e.name AS event_name,
        gs AS guest_seq,
        CASE
            WHEN gs <= 4 THEN 'pending'
            WHEN gs <= 8 THEN 'confirmed'
            ELSE 'scanned'
        END AS status,
        CASE
            WHEN gs > 4 THEN
                jsonb_build_object(
                    'channel', CASE WHEN gs % 2 = 0 THEN 'whatsapp' ELSE 'email' END,
                    'confirmed_at', now() - (gs * interval '1 day')
                )
            ELSE NULL
        END AS confirmation_payload,
        format('%s Invitado %s', e.name, gs) AS guest_name,
        '+52' || lpad((55 + e.event_idx)::text, 2, '0') || lpad(gs::text, 2, '0') || lpad((gs * 7)::text, 4, '0') AS phone,
        lower(replace(e.name, ' ', '.')) || '.guest' || gs || '@demo.monotickets.mx' AS email
    FROM event_seed e
    CROSS JOIN generate_series(1, 16) AS gs
),
guest_insert AS (
    INSERT INTO guests (event_id, name, phone, email, status, confirmation_payload)
    SELECT event_id, guest_name, phone, email, status, confirmation_payload
    FROM guest_blueprint
    RETURNING *
),
guest_enriched AS (
    SELECT
        gi.*,
        gb.guest_seq,
        gb.event_name,
        gb.type AS event_type,
        gb.organizer_id
    FROM guest_insert gi
    JOIN guest_blueprint gb
      ON gb.event_id = gi.event_id AND gb.email = gi.email
),
invite_payload AS (
    SELECT
        g.event_id,
        g.id AS guest_id,
        CONCAT('MT-', upper(encode(gen_random_bytes(4), 'hex'))) AS code
    FROM guest_enriched g
),
invite_insert AS (
    INSERT INTO invites (event_id, guest_id, code, links)
    SELECT
        event_id,
        guest_id,
        code,
        jsonb_build_object(
            'invite', format('/public/invite/%s', code),
            'confirm', format('/public/confirm/%s', code),
            'pdf', format('/public/invite/%s.pdf', code)
        )
    FROM invite_payload
    RETURNING *
),
scanned_guests AS (
    SELECT
        g.id,
        g.event_id,
        g.guest_seq,
        ROW_NUMBER() OVER (PARTITION BY g.event_id ORDER BY g.created_at) AS rn
    FROM guest_enriched g
    WHERE g.status = 'scanned'
),
valid_scans AS (
    INSERT INTO scan_logs (event_id, guest_id, result, ts, device)
    SELECT
        sg.event_id,
        sg.id AS guest_id,
        'valid',
        CASE
            WHEN e.event_idx = 1 AND attempt = 1 THEN
                c.previous_month_start + ((sg.rn % 10) * interval '1 day') + (attempt * interval '25 minutes')
            ELSE
                c.current_month_start + ((sg.rn % 12) * interval '1 day') + (attempt * interval '20 minutes')
        END AS ts,
        jsonb_build_object(
            'device_id', concat('scanner-', left(sg.event_id::text, 8)),
            'location', CASE WHEN sg.rn % 2 = 0 THEN 'Main Gate' ELSE 'VIP Gate' END
        )
    FROM scanned_guests sg
    JOIN event_seed e ON e.id = sg.event_id
    CROSS JOIN constants c
    CROSS JOIN generate_series(1, 2) AS attempt
    RETURNING 1
),
duplicate_scans AS (
    INSERT INTO scan_logs (event_id, guest_id, result, ts, device)
    SELECT
        sg.event_id,
        sg.id AS guest_id,
        'duplicate',
        CASE
            WHEN e.event_idx = 1 THEN
                c.current_month_start + ((sg.guest_seq % 6) * interval '2 days') + (dup.iteration * interval '5 minutes')
            ELSE
                c.current_month_start + ((sg.guest_seq % 8) * interval '1 day') + (dup.iteration * interval '4 minutes')
        END AS ts,
        jsonb_build_object(
            'device_id', concat('scanner-', left(sg.event_id::text, 8)),
            'location', CASE WHEN sg.rn % 3 = 0 THEN 'Secondary Gate' ELSE 'Main Gate' END
        )
    FROM scanned_guests sg
    JOIN event_seed e ON e.id = sg.event_id
    CROSS JOIN constants c
    JOIN LATERAL generate_series(1, 3) AS dup(iteration) ON TRUE
    RETURNING 1
),
invalid_scans AS (
    INSERT INTO scan_logs (event_id, guest_id, result, ts, device)
    SELECT
        g.event_id,
        g.id,
        'invalid',
        CASE
            WHEN g.guest_seq % 2 = 0 THEN
                c.previous_month_start + interval '12 days' - (attempt.iteration * interval '30 minutes')
            ELSE
                c.current_month_start + interval '3 days' - (attempt.iteration * interval '20 minutes')
        END,
        jsonb_build_object('device_id', 'scanner-reject', 'location', 'Service Desk')
    FROM guest_enriched g
    CROSS JOIN constants c
    JOIN LATERAL generate_series(1, 2) AS attempt(iteration) ON TRUE
    WHERE g.status = 'pending'
    RETURNING 1
),
confirmed_guests AS (
    SELECT g.*, e.event_idx
    FROM guest_enriched g
    JOIN event_seed e ON e.id = g.event_id
    WHERE g.status IN ('confirmed', 'scanned')
),
delivery_plan AS (
    SELECT
        e.organizer_id,
        g.event_id,
        g.id AS guest_id,
        CASE WHEN (g.guest_seq + attempt.attempt) % 2 = 0 THEN 'whatsapp' ELSE 'email' END AS channel,
        CASE
            WHEN (g.guest_seq + attempt.attempt) % 3 = 0 THEN 'reminder_template'
            WHEN (g.guest_seq + attempt.attempt) % 2 = 0 THEN 'session_followup'
            ELSE 'initial_invite'
        END AS template,
        CASE
            WHEN (g.guest_seq + attempt.attempt) % 7 = 0 THEN 'failed'
            WHEN (g.guest_seq + attempt.attempt) % 5 = 0 THEN 'queued'
            WHEN (g.guest_seq + attempt.attempt) % 3 = 0 THEN 'sent'
            ELSE 'delivered'
        END AS status,
        concat('ref-', upper(encode(gen_random_bytes(3), 'hex'))) AS provider_ref,
        now() - ((g.guest_seq + attempt.attempt) * interval '6 hours') AS created_at,
        CASE
            WHEN (g.guest_seq + attempt.attempt) % 7 = 0 THEN jsonb_build_object('code', 'WA-400', 'message', 'Outside 24h window')
            ELSE NULL
        END AS error
    FROM confirmed_guests g
    JOIN event_seed e ON e.id = g.event_id
    JOIN LATERAL generate_series(1, 4) AS attempt(attempt) ON TRUE
),
delivery_insert AS (
    INSERT INTO delivery_logs (organizer_id, event_id, guest_id, channel, template, status, provider_ref, error, created_at, updated_at)
    SELECT
        organizer_id,
        event_id,
        guest_id,
        channel,
        template,
        status,
        provider_ref,
        error,
        created_at,
        CASE WHEN status = 'queued' THEN created_at ELSE created_at + interval '15 minutes' END
    FROM delivery_plan
    RETURNING *
),
ledger_insert AS (
    INSERT INTO ticket_ledger (organizer_id, event_id, kind, tickets, equiv_json, unit_price)
    SELECT organizer_id, event_id, kind, tickets, equiv_json, unit_price
    FROM (
        SELECT
            (SELECT id FROM organizer_seed WHERE name = 'Experiencias Aurora') AS organizer_id,
            (SELECT id FROM event_seed WHERE name = 'Gala Innovación 2024') AS event_id,
            'prepago'::text AS kind,
            300 AS tickets,
            jsonb_build_object(
                'standard_equiv', 300,
                'premium_equiv', 150,
                'ratio', jsonb_build_object('standard', 1, 'premium', 2)
            ) AS equiv_json,
            5.00::numeric AS unit_price
        UNION ALL
        SELECT
            (SELECT id FROM organizer_seed WHERE name = 'Experiencias Aurora'),
            (SELECT id FROM event_seed WHERE name = 'Gala Innovación 2024'),
            'prestamo',
            120,
            jsonb_build_object(
                'standard_equiv', 120,
                'premium_equiv', 60,
                'ratio', jsonb_build_object('standard', 1, 'premium', 2)
            ),
            5.00::numeric
        UNION ALL
        SELECT
            (SELECT id FROM organizer_seed WHERE name = 'Momentum Eventos'),
            (SELECT id FROM event_seed WHERE name = 'Summit Premium Riviera'),
            'prepago',
            220,
            jsonb_build_object(
                'standard_equiv', 220,
                'premium_equiv', 110,
                'ratio', jsonb_build_object('standard', 1, 'premium', 2)
            ),
            3.50::numeric
        UNION ALL
        SELECT
            (SELECT id FROM organizer_seed WHERE name = 'Momentum Eventos'),
            (SELECT id FROM event_seed WHERE name = 'Summit Premium Riviera'),
            'prestamo',
            140,
            jsonb_build_object(
                'standard_equiv', 140,
                'premium_equiv', 70,
                'ratio', jsonb_build_object('standard', 1, 'premium', 2)
            ),
            3.50::numeric
    ) ledger_rows
    RETURNING *
),
payments_insert AS (
    INSERT INTO payments (organizer_id, amount, method, ref)
    VALUES
        (
            (SELECT id FROM organizer_seed WHERE name = 'Experiencias Aurora'),
            750.00,
            'transferencia',
            'AUR-TR-001'
        ),
        (
            (SELECT id FROM organizer_seed WHERE name = 'Experiencias Aurora'),
            320.00,
            'transferencia',
            'AUR-TR-002'
        ),
        (
            (SELECT id FROM organizer_seed WHERE name = 'Momentum Eventos'),
            420.00,
            'spei',
            'MOM-SPEI-9001'
        )
    RETURNING *
)
SELECT
    (SELECT COUNT(*) FROM organizer_seed) AS organizers_inserted,
    (SELECT COUNT(*) FROM event_seed) AS events_inserted,
    (SELECT COUNT(*) FROM guest_insert) AS guests_inserted,
    (SELECT COUNT(*) FROM invite_insert) AS invites_inserted,
    (SELECT COUNT(*) FROM delivery_insert) AS delivery_logs_inserted,
    (SELECT COUNT(*) FROM scan_logs) AS total_scan_logs,
    (SELECT COUNT(*) FROM ledger_insert) AS ledger_rows,
    (SELECT COUNT(*) FROM payments_insert) AS payments_rows;
