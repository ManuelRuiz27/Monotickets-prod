BEGIN;

DO $$
DECLARE
    month_key text;
BEGIN
    FOR month_key IN
        SELECT to_char(date_trunc('month', current_date) + (month_offset * interval '1 month'), 'YYYYMM')
        FROM generate_series(-1, 0) AS offsets(month_offset)
    LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS scan_logs_%s PARTITION OF scan_logs FOR VALUES IN (%L);',
            month_key,
            month_key
        );
    END LOOP;
END $$;

-- Retention policy (ejemplo para 90-180 días):
-- -- Revisar particiones anteriores y eliminarlas manualmente o mediante job agendado.
-- -- Ejemplo:
-- -- DO $$
-- -- DECLARE
-- --     cutoff text := to_char(date_trunc('month', current_date - interval '6 months'), 'YYYYMM');
-- --     partition_name text;
-- -- BEGIN
-- --     FOR partition_name IN
-- --         SELECT inhrelid::regclass::text
-- --         FROM pg_inherits
-- --         WHERE inhparent = 'scan_logs'::regclass
-- --           AND substring(inhrelid::regclass::text from 'scan_logs_(\\d{6})') < cutoff
-- --     LOOP
-- --         EXECUTE format('DROP TABLE IF EXISTS %I;', partition_name);
-- --     END LOOP;
-- -- END $$;

COMMIT;
