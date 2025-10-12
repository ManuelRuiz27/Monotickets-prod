BEGIN;

-- Ledger de Director
CREATE TABLE IF NOT EXISTS director_ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id uuid NOT NULL,
    event_id uuid REFERENCES events(id) ON DELETE SET NULL,
    entry_type text NOT NULL CHECK (entry_type IN ('assign_prepaid', 'assign_loan', 'payment')),
    tickets integer NOT NULL DEFAULT 0 CHECK (tickets >= 0),
    tickets_equivalent integer NOT NULL DEFAULT 0 CHECK (tickets_equivalent >= 0),
    unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
    amount_cents integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'mxn',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_director_ledger_org_created_at ON director_ledger_entries (organizer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_director_ledger_event_created_at ON director_ledger_entries (event_id, created_at DESC);

-- Índices críticos adicionales
CREATE INDEX IF NOT EXISTS idx_scan_logs_event_ts ON scan_logs (event_id, ts);
CREATE INDEX IF NOT EXISTS idx_guests_status_event ON guests (event_id, status);
CREATE INDEX IF NOT EXISTS idx_invites_code_event ON invites (event_id, code);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_provider_ref ON delivery_logs (provider_ref);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_guest_created_at ON delivery_logs (guest_id, created_at);

-- Asegurar particiones mensuales (mes anterior, actual, siguiente)
DO $$
DECLARE
    month_key text;
    partition_name text;
    remainder integer;
BEGIN
    FOR month_key IN
        SELECT to_char(date_trunc('month', current_date) + (offset * interval '1 month'), 'YYYYMM')
        FROM generate_series(-1, 2) AS offsets(offset)
    LOOP
        partition_name := format('delivery_logs_%s', month_key);
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF delivery_logs FOR VALUES IN (%L) PARTITION BY HASH (event_id);',
                partition_name,
                month_key
            );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name || '_evt_0') THEN
            FOR remainder IN 0..3 LOOP
                EXECUTE format(
                    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES WITH (modulus 4, remainder %s);',
                    partition_name || '_evt_' || remainder,
                    partition_name,
                    remainder
                );
            END LOOP;
        END IF;

        partition_name := format('scan_logs_%s', month_key);
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF scan_logs FOR VALUES IN (%L) PARTITION BY HASH (event_id);',
                partition_name,
                month_key
            );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name || '_evt_0') THEN
            FOR remainder IN 0..3 LOOP
                EXECUTE format(
                    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES WITH (modulus 4, remainder %s);',
                    partition_name || '_evt_' || remainder,
                    partition_name,
                    remainder
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Retención de 6 meses (aprox. 180 días)
DO $$
DECLARE
    cutoff text := to_char(date_trunc('month', current_date - interval '6 months'), 'YYYYMM');
    part text;
BEGIN
    FOR part IN SELECT inhrelid::regclass::text FROM pg_inherits WHERE inhparent = 'delivery_logs'::regclass LOOP
        IF substring(part from 'delivery_logs_(\d{6})') < cutoff THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE;', part);
        END IF;
    END LOOP;

    FOR part IN SELECT inhrelid::regclass::text FROM pg_inherits WHERE inhparent = 'scan_logs'::regclass LOOP
        IF substring(part from 'scan_logs_(\d{6})') < cutoff THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE;', part);
        END IF;
    END LOOP;
END $$;

-- Vistas materializadas de KPIs
DROP MATERIALIZED VIEW IF EXISTS mv_kpi_tickets_entregados;
CREATE MATERIALIZED VIEW mv_kpi_tickets_entregados AS
SELECT
    organizer_id,
    event_id,
    SUM(tickets) AS tickets_asignados,
    SUM(tickets_equivalent) AS tickets_equivalentes,
    SUM(CASE WHEN entry_type IN ('assign_prepaid', 'assign_loan') THEN amount_cents ELSE 0 END) AS valor_asignado_cents,
    MAX(created_at) AS ultima_asignacion
FROM director_ledger_entries
WHERE entry_type IN ('assign_prepaid', 'assign_loan')
GROUP BY organizer_id, event_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpi_tickets_entregados_unique ON mv_kpi_tickets_entregados (organizer_id, event_id);

DROP MATERIALIZED VIEW IF EXISTS mv_kpi_deuda_abierta;
CREATE MATERIALIZED VIEW mv_kpi_deuda_abierta AS
SELECT
    organizer_id,
    SUM(CASE WHEN entry_type IN ('assign_prepaid', 'assign_loan') THEN amount_cents ELSE 0 END)
      - SUM(CASE WHEN entry_type = 'payment' THEN amount_cents ELSE 0 END) AS balance_cents,
    NOW() AS refreshed_at
FROM director_ledger_entries
GROUP BY organizer_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpi_deuda_abierta_org ON mv_kpi_deuda_abierta (organizer_id);

DROP MATERIALIZED VIEW IF EXISTS mv_kpi_top_organizadores;
CREATE MATERIALIZED VIEW mv_kpi_top_organizadores AS
SELECT
    organizer_id,
    SUM(tickets_equivalent) AS tickets_equivalentes,
    SUM(amount_cents) FILTER (WHERE entry_type IN ('assign_prepaid', 'assign_loan')) AS valor_asignado_cents,
    RANK() OVER (ORDER BY SUM(tickets_equivalent) DESC) AS ranking
FROM director_ledger_entries
WHERE entry_type IN ('assign_prepaid', 'assign_loan')
GROUP BY organizer_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpi_top_organizadores_org ON mv_kpi_top_organizadores (organizer_id);

COMMIT;
