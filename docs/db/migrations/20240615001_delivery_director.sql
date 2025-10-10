-- Delivery & Director infrastructure (queues, payments, KPIs)
BEGIN;

-- Payments ledger
CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid REFERENCES events(id) ON DELETE SET NULL,
    organizer_id uuid,
    amount_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'mxn',
    status text NOT NULL CHECK (status IN (
        'pending',
        'requires_confirmation',
        'processing',
        'succeeded',
        'confirmed',
        'failed',
        'paid'
    )),
    provider text NOT NULL,
    provider_ref text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    client_secret text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payments_event_status ON payments (event_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments (provider_ref);
CREATE INDEX IF NOT EXISTS idx_payments_status_created_at ON payments (status, created_at);

-- Add helper indexes for critical lookups
CREATE INDEX IF NOT EXISTS idx_events_status_starts_at ON events (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_guests_event_phone ON guests (event_id, phone);
CREATE INDEX IF NOT EXISTS idx_invites_event_code ON invites (event_id, code);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_event_status ON delivery_logs (event_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_provider_ref ON delivery_logs (provider_ref);

-- Partition delivery_logs by month and hash(event_id)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = 'delivery_logs'::regclass) THEN
        EXECUTE 'ALTER TABLE delivery_logs RENAME TO delivery_logs_legacy';
        EXECUTE '
            CREATE TABLE delivery_logs (
                LIKE delivery_logs_legacy INCLUDING ALL
            ) PARTITION BY LIST (to_char(created_at, ''YYYYMM''))
        ';
        EXECUTE 'INSERT INTO delivery_logs SELECT * FROM delivery_logs_legacy';
        EXECUTE 'DROP TABLE delivery_logs_legacy';
    END IF;
END $$;

DO $$
DECLARE
    month_key text;
    partition_name text;
    remainder integer;
BEGIN
    FOR month_key IN
        SELECT to_char(date_trunc('month', current_date) + (offset * interval ''1 month''), 'YYYYMM')
        FROM generate_series(-1, 2) AS offsets(offset)
    LOOP
        partition_name := format('delivery_logs_%s', month_key);
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
            IF NOT EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = partition_name::regclass) THEN
                EXECUTE format('ALTER TABLE %I RENAME TO %I;', partition_name, partition_name || '_legacy');
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF delivery_logs FOR VALUES IN (%L) PARTITION BY HASH (event_id);',
                    partition_name,
                    month_key
                );
                EXECUTE format('INSERT INTO %I SELECT * FROM %I;', partition_name, partition_name || '_legacy');
                EXECUTE format('DROP TABLE %I;', partition_name || '_legacy');
            END IF;
        ELSE
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF delivery_logs FOR VALUES IN (%L) PARTITION BY HASH (event_id);',
                partition_name,
                month_key
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = partition_name || '_evt_0'
        ) THEN
            FOR remainder IN 0..3 LOOP
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF %I FOR VALUES WITH (modulus 4, remainder %s);',
                    partition_name || '_evt_' || remainder,
                    partition_name,
                    remainder
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Partition scan_logs with monthly + hash(event_id)
DO $$
DECLARE
    month_key text;
    partition_name text;
    remainder integer;
BEGIN
    FOR month_key IN
        SELECT to_char(date_trunc('month', current_date) + (offset * interval ''1 month''), 'YYYYMM')
        FROM generate_series(-1, 2) AS offsets(offset)
    LOOP
        partition_name := format('scan_logs_%s', month_key);
        IF EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
            IF NOT EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = partition_name::regclass) THEN
                EXECUTE format('ALTER TABLE %I RENAME TO %I;', partition_name, partition_name || '_legacy');
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF scan_logs FOR VALUES IN (%L) PARTITION BY HASH (event_id);',
                    partition_name,
                    month_key
                );
                EXECUTE format('INSERT INTO %I SELECT * FROM %I;', partition_name, partition_name || '_legacy');
                EXECUTE format('DROP TABLE %I;', partition_name || '_legacy');
            END IF;
        ELSE
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF scan_logs FOR VALUES IN (%L) PARTITION BY HASH (event_id);',
                partition_name,
                month_key
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = partition_name || '_evt_0'
        ) THEN
            FOR remainder IN 0..3 LOOP
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF %I FOR VALUES WITH (modulus 4, remainder %s);',
                    partition_name || '_evt_' || remainder,
                    partition_name,
                    remainder
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Retention policy (drop partitions older than 6 months)
DO $$
DECLARE
    cutoff text := to_char(date_trunc('month', current_date - interval '6 months'), 'YYYYMM');
    part text;
BEGIN
    FOR part IN
        SELECT inhrelid::regclass::text
        FROM pg_inherits
        WHERE inhparent = 'scan_logs'::regclass
    LOOP
        IF substring(part from 'scan_logs_(\d{6})') < cutoff THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE;', part);
        END IF;
    END LOOP;

    FOR part IN
        SELECT inhrelid::regclass::text
        FROM pg_inherits
        WHERE inhparent = 'delivery_logs'::regclass
    LOOP
        IF substring(part from 'delivery_logs_(\d{6})') < cutoff THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE;', part);
        END IF;
    END LOOP;
END $$;

-- KPI materialized views
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kpi_confirm_rate AS
SELECT
    g.event_id,
    date_trunc('day', g.created_at) AS bucket_day,
    COUNT(*) FILTER (WHERE g.status = 'confirmed') AS confirmed_count,
    COUNT(*) AS total_guests,
    CASE WHEN COUNT(*) = 0 THEN 0 ELSE COUNT(*) FILTER (WHERE g.status = 'confirmed')::numeric / COUNT(*) END AS confirm_rate,
    now() AS refreshed_at
FROM guests g
GROUP BY g.event_id, bucket_day;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kpi_time_to_confirm AS
WITH source AS (
    SELECT
        g.event_id,
        g.created_at,
        NULLIF((g.confirmation_payload ->> 'confirmed_at')::timestamptz, NULL) AS confirmed_at
    FROM guests g
)
SELECT
    event_id,
    COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmations,
    COALESCE(AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))), 0) AS avg_seconds_to_confirm,
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (confirmed_at - created_at))), 0) AS median_seconds_to_confirm,
    now() AS refreshed_at
FROM source
WHERE confirmed_at IS NOT NULL
GROUP BY event_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kpi_wa_sessions_ratio AS
WITH stats AS (
    SELECT
        g.event_id,
        COUNT(*) FILTER (WHERE ws.expires_at > now()) AS active_sessions,
        COUNT(*) AS total_guests
    FROM guests g
    LEFT JOIN wa_sessions ws ON ws.phone = g.phone
    GROUP BY g.event_id
)
SELECT
    e.id AS event_id,
    COALESCE(stats.active_sessions::numeric / NULLIF(stats.total_guests, 0), 0) AS active_ratio,
    COALESCE(stats.active_sessions, 0) AS active_sessions,
    COALESCE(stats.total_guests, 0) AS total_guests,
    now() AS refreshed_at
FROM events e
LEFT JOIN stats ON stats.event_id = e.id;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kpi_show_up_rate AS
WITH data AS (
    SELECT
        g.event_id,
        COUNT(DISTINCT CASE WHEN s.result IN ('valid', 'duplicate') THEN s.guest_id END) AS scanned,
        COUNT(DISTINCT CASE WHEN g.status IN ('confirmed', 'scanned') THEN g.id END) AS confirmed
    FROM guests g
    LEFT JOIN scan_logs s ON s.guest_id = g.id
    GROUP BY g.event_id
)
SELECT
    e.id AS event_id,
    COALESCE(data.scanned::numeric / NULLIF(data.confirmed, 0), 0) AS show_up_rate,
    COALESCE(data.scanned, 0) AS scanned,
    COALESCE(data.confirmed, 0) AS confirmed,
    now() AS refreshed_at
FROM events e
LEFT JOIN data ON data.event_id = e.id;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_kpi_landing_visits AS
SELECT
    dl.event_id,
    date_trunc('day', dl.created_at) AS bucket_day,
    COUNT(*) FILTER (WHERE dl.status IN ('delivered', 'sent')) AS total_visits,
    COUNT(*) FILTER (WHERE dl.channel = 'whatsapp') AS whatsapp_visits,
    COUNT(*) FILTER (WHERE dl.channel = 'email') AS email_visits,
    now() AS refreshed_at
FROM delivery_logs dl
WHERE dl.event_id IS NOT NULL
GROUP BY dl.event_id, bucket_day;

COMMIT;
