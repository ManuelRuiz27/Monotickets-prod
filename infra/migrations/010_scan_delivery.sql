BEGIN;

CREATE TABLE IF NOT EXISTS scan_logs (
    id bigserial,
    event_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    staff_id uuid,
    result text NOT NULL CHECK (result IN ('valid', 'duplicate', 'invalid')),
    ts timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz GENERATED ALWAYS AS (ts) STORED,
    device jsonb,
    PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

-- Particiones mensuales para el mes anterior y el actual.
DO $$
DECLARE
    month_start date;
    partition_start timestamptz;
    partition_end timestamptz;
    partition_name text;
BEGIN
    FOR month_start IN SELECT date_trunc('month', current_date + (offset_val * interval '1 month'))::date
        FROM generate_series(-1, 0) AS g(offset_val)
    LOOP
        partition_start := month_start;
        partition_end := (month_start + interval '1 month');
        partition_name := format('scan_logs_%s', to_char(month_start, 'YYYYMM'));

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF scan_logs FOR VALUES FROM (%L) TO (%L);',
            partition_name,
            partition_start,
            partition_end
        );
    END LOOP;
END $$;

-- Helper para preparar la partición del siguiente mes (ejecutar cercano al fin de mes).
-- DO $$
-- DECLARE
--     next_month date := date_trunc('month', current_date + interval '1 month')::date;
-- BEGIN
--     EXECUTE format(
--         'CREATE TABLE IF NOT EXISTS %I PARTITION OF scan_logs FOR VALUES FROM (%L) TO (%L);',
--         format('scan_logs_%s', to_char(next_month, 'YYYYMM')),
--         next_month,
--         next_month + interval '1 month'
--     );
-- END $$;

-- Política de retención sugerida (90-180 días): revisar particiones anteriores y eliminarlas mediante job programado.

CREATE TABLE IF NOT EXISTS delivery_logs (
    id bigserial PRIMARY KEY,
    organizer_id uuid NOT NULL,
    event_id uuid,
    guest_id uuid,
    channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
    template text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
    provider_ref text,
    error jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
