WITH event_seed AS (
    INSERT INTO events (name, type, status, starts_at, ends_at)
    VALUES
        (
            'Tech Summit CDMX',
            'standard',
            'active',
            date_trunc('day', now() + interval '15 days') + interval '10 hours',
            date_trunc('day', now() + interval '15 days') + interval '18 hours'
        ),
        (
            'Luxury Launch Riviera',
            'premium',
            'active',
            date_trunc('day', now() + interval '30 days') + interval '17 hours',
            date_trunc('day', now() + interval '30 days') + interval '23 hours'
        )
    RETURNING id, name, starts_at, ROW_NUMBER() OVER (ORDER BY starts_at) AS event_idx
),
guest_seed AS (
    SELECT
        e.id AS event_id,
        e.name AS event_name,
        e.event_idx,
        gs AS guest_number,
        CASE
            WHEN gs <= 12 THEN 'confirmed'
            WHEN gs = 20 THEN 'scanned'
            ELSE 'pending'
        END AS status,
        CASE
            WHEN gs <= 12 OR gs = 20 THEN
                jsonb_build_object(
                    'channel', CASE WHEN gs % 2 = 0 THEN 'whatsapp' ELSE 'email' END,
                    'confirmed_at', (now() - (gs * interval '1 day'))
                )
            ELSE NULL
        END AS confirmation_payload,
        format('%s Invitado %s', e.name, gs) AS guest_name,
        '+52155'
        || lpad(e.event_idx::text, 2, '0')
        || lpad(gs::text, 2, '0')
        || lpad((gs * 3 + e.event_idx)::text, 2, '0') AS phone,
        lower(replace(e.name, ' ', '_')) || '_guest' || gs || '@example.com' AS email
    FROM event_seed e
    CROSS JOIN generate_series(1, 20) AS gs
),
guests_inserted AS (
    INSERT INTO guests (event_id, name, phone, email, status, confirmation_payload)
    SELECT event_id, guest_name, phone, email, status, confirmation_payload
    FROM guest_seed
    RETURNING *
),
invite_payload AS (
    SELECT
        g.event_id,
        g.id AS guest_id,
        CONCAT('MT-', upper(encode(gen_random_bytes(4), 'hex'))) AS code
    FROM guests_inserted g
),
invites_inserted AS (
    INSERT INTO invites (event_id, guest_id, code, links)
    SELECT
        event_id,
        guest_id,
        code,
        jsonb_build_object(
            'confirm', format('/public/confirm/%s', code),
            'invite', format('/public/invite/%s', code),
            'pdf', format('/public/invite/%s.pdf', code)
        )
    FROM invite_payload
    RETURNING *
),
confirmed_guests AS (
    SELECT
        g.id AS guest_id,
        g.event_id,
        ROW_NUMBER() OVER (PARTITION BY g.event_id ORDER BY g.created_at) AS rn
    FROM guests_inserted g
    WHERE g.status IN ('confirmed', 'scanned')
),
valid_scans_data AS (
    SELECT
        cg.event_id,
        cg.guest_id,
        'valid'::text AS result,
        CASE
            WHEN cg.rn % 2 = 0 THEN date_trunc('minute', now() - interval '40 days') - (cg.rn * interval '45 minutes')
            ELSE date_trunc('minute', now() - interval '12 days') - (cg.rn * interval '30 minutes')
        END AS ts,
        jsonb_build_object(
            'location', CASE WHEN cg.rn % 2 = 0 THEN 'VIP Gate' ELSE 'Main Gate' END,
            'device_id', concat('scanner-', cg.event_id::text)
        ) AS device,
        cg.rn
    FROM confirmed_guests cg
    WHERE cg.rn <= 8
),
valid_scans AS (
    INSERT INTO scan_logs (event_id, guest_id, result, ts, device)
    SELECT event_id, guest_id, result, ts, device
    FROM valid_scans_data
    RETURNING 1
),
duplicate_scans AS (
    INSERT INTO scan_logs (event_id, guest_id, result, ts, device)
    SELECT
        v.event_id,
        v.guest_id,
        'duplicate',
        v.ts + (dup.iteration * interval '45 seconds'),
        v.device
    FROM valid_scans_data v
    JOIN LATERAL generate_series(1, 3) AS dup(iteration) ON TRUE
    RETURNING 1
),
pending_guests AS (
    SELECT
        g.id AS guest_id,
        g.event_id,
        ROW_NUMBER() OVER (PARTITION BY g.event_id ORDER BY g.created_at) AS rn
    FROM guests_inserted g
    WHERE g.status = 'pending'
),
invalid_scans AS (
    INSERT INTO scan_logs (event_id, guest_id, result, ts, device)
    SELECT
        pg.event_id,
        pg.guest_id,
        'invalid',
        date_trunc('minute', now() - interval '5 days')
            - (pg.rn * interval '20 minutes')
            - (attempt.iteration * interval '10 minutes'),
        jsonb_build_object('location', 'Main Gate', 'device_id', 'scanner-reject')
    FROM pending_guests pg
    JOIN LATERAL generate_series(1, 2) AS attempt(iteration) ON TRUE
    RETURNING 1
),
wa_sessions_seed AS (
    INSERT INTO wa_sessions (phone, opened_at, expires_at)
    SELECT
        phone,
        now() - (ROW_NUMBER() OVER (ORDER BY phone) * interval '2 hours'),
        now() + interval '22 hours'
    FROM (
        SELECT DISTINCT phone
        FROM guests_inserted
        WHERE status IN ('confirmed', 'scanned')
        ORDER BY phone
        LIMIT 3
    ) phone_list
    RETURNING *
),
organizer_data AS (
    SELECT
        e.id AS event_id,
        gen_random_uuid() AS organizer_id,
        e.event_idx
    FROM event_seed e
),
all_guests AS (
    SELECT g.*, ROW_NUMBER() OVER (ORDER BY g.created_at) AS global_rn
    FROM guests_inserted g
),
delivery_data AS (
    SELECT
        og.organizer_id,
        g.event_id,
        g.id AS guest_id,
        CASE WHEN (g.global_rn + attempt) % 2 = 0 THEN 'whatsapp' ELSE 'email' END AS channel,
        CASE
            WHEN (g.global_rn + attempt) % 2 = 0 AND ((g.global_rn + attempt) % 3 = 0)
                THEN 'whatsapp_template'
            WHEN (g.global_rn + attempt) % 2 = 0
                THEN 'whatsapp_session'
            ELSE 'email_campaign'
        END AS template,
        CASE
            WHEN (g.global_rn + attempt) % 7 = 0 THEN 'failed'
            WHEN (g.global_rn + attempt) % 5 = 0 THEN 'queued'
            WHEN (g.global_rn + attempt) % 3 = 0 THEN 'sent'
            ELSE 'delivered'
        END AS status,
        concat('msg-', upper(encode(gen_random_bytes(3), 'hex'))) AS provider_ref,
        now() - ((g.global_rn + attempt) * interval '45 minutes') AS created_at,
        CASE
            WHEN (g.global_rn + attempt) % 7 = 0 THEN
                jsonb_build_object(
                    'code', 'WA-400',
                    'message', 'Message outside 24h session window'
                )
            ELSE NULL
        END AS error
    FROM all_guests g
    JOIN organizer_data og ON og.event_id = g.event_id
    JOIN LATERAL generate_series(1, 3) AS attempt(attempt) ON TRUE
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
        CASE
            WHEN status = 'queued' THEN created_at
            ELSE created_at + interval '10 minutes'
        END
    FROM delivery_data
    RETURNING 1
)
SELECT
    (SELECT COUNT(*) FROM event_seed) AS events_inserted,
    (SELECT COUNT(*) FROM guests_inserted) AS guests_inserted,
    (SELECT COUNT(*) FROM invites_inserted) AS invites_inserted,
    (SELECT COUNT(*) FROM valid_scans) AS valid_scans_inserted,
    (SELECT COUNT(*) FROM duplicate_scans) AS duplicate_scans_inserted,
    (SELECT COUNT(*) FROM invalid_scans) AS invalid_scans_inserted,
    (SELECT COUNT(*) FROM scan_logs) AS total_scan_logs,
    (SELECT COUNT(*) FROM delivery_logs) AS total_delivery_logs;
