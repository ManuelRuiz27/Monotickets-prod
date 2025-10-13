BEGIN;

-- Índices adicionales para acelerar filtros por fecha/estado en delivery_logs
CREATE INDEX IF NOT EXISTS idx_delivery_logs_event_created_at ON delivery_logs (event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_status_created_at ON delivery_logs (status, created_at);

-- Garantizar particiones futuras (mes actual + siguiente) para delivery_logs y scan_logs
DO $$
DECLARE
    month_key text;
    start_at timestamptz;
    end_at timestamptz;
BEGIN
    FOR month_key IN
        SELECT to_char(date_trunc('month', current_date) + (offset * interval '1 month'), 'YYYYMM')
          FROM generate_series(0, 2) AS offsets(offset)
    LOOP
        start_at := to_timestamp(month_key || '01', 'YYYYMMDD');
        end_at := start_at + interval '1 month';

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS delivery_logs_%s PARTITION OF delivery_logs FOR VALUES FROM (%L) TO (%L);',
            month_key,
            start_at,
            end_at
        );

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS scan_logs_%s PARTITION OF scan_logs FOR VALUES FROM (%L) TO (%L);',
            month_key,
            start_at,
            end_at
        );
    END LOOP;
END $$;

-- Vistas materializadas actualizadas con marcas temporales para filtros dinámicos
DROP MATERIALIZED VIEW IF EXISTS mv_kpi_tickets_entregados;
CREATE MATERIALIZED VIEW mv_kpi_tickets_entregados AS
SELECT
    organizer_id,
    event_id,
    MIN(created_at) FILTER (WHERE entry_type IN ('assign_prepaid','assign_loan')) AS primera_asignacion,
    MAX(created_at) FILTER (WHERE entry_type IN ('assign_prepaid','assign_loan')) AS ultima_asignacion,
    SUM(tickets) AS tickets_asignados,
    SUM(tickets_equivalent) AS tickets_equivalentes,
    SUM(CASE WHEN entry_type IN ('assign_prepaid','assign_loan') THEN amount_cents ELSE 0 END) AS valor_asignado_cents
FROM director_ledger_entries
WHERE entry_type IN ('assign_prepaid','assign_loan')
GROUP BY organizer_id, event_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpi_tickets_entregados_unique ON mv_kpi_tickets_entregados (organizer_id, event_id);

DROP MATERIALIZED VIEW IF EXISTS mv_kpi_deuda_abierta;
CREATE MATERIALIZED VIEW mv_kpi_deuda_abierta AS
SELECT
    organizer_id,
    SUM(CASE WHEN entry_type IN ('assign_prepaid','assign_loan') THEN amount_cents ELSE 0 END)
      - SUM(CASE WHEN entry_type = 'payment' THEN amount_cents ELSE 0 END) AS balance_cents,
    MAX(created_at) AS ultima_actualizacion
FROM director_ledger_entries
GROUP BY organizer_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpi_deuda_abierta_org ON mv_kpi_deuda_abierta (organizer_id);

DROP MATERIALIZED VIEW IF EXISTS mv_kpi_top_organizadores;
CREATE MATERIALIZED VIEW mv_kpi_top_organizadores AS
SELECT
    organizer_id,
    SUM(tickets_equivalent) AS tickets_equivalentes,
    SUM(amount_cents) FILTER (WHERE entry_type IN ('assign_prepaid','assign_loan')) AS valor_asignado_cents,
    MAX(created_at) AS ultima_asignacion,
    RANK() OVER (ORDER BY SUM(tickets_equivalent) DESC) AS ranking
FROM director_ledger_entries
WHERE entry_type IN ('assign_prepaid','assign_loan')
GROUP BY organizer_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpi_top_organizadores_org ON mv_kpi_top_organizadores (organizer_id);

COMMIT;
