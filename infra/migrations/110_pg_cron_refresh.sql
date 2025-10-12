BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
    ELSE
        RAISE NOTICE 'pg_cron extension is not available in this Postgres build.';
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('cron.job') IS NULL THEN
        RAISE NOTICE 'cron.job catalog not found. Configure an external worker to refresh KPIs (see docs/bi/kpis.md).';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mv_confirmation_rate_daily_5m') THEN
        PERFORM cron.schedule('mv_confirmation_rate_daily_5m', '*/5 * * * *',
            $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_confirmation_rate_daily$$);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mv_show_up_rate_daily_5m') THEN
        PERFORM cron.schedule('mv_show_up_rate_daily_5m', '*/5 * * * *',
            $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_show_up_rate_daily$$);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mv_wa_free_ratio_daily_10m') THEN
        PERFORM cron.schedule('mv_wa_free_ratio_daily_10m', '*/10 * * * *',
            $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_wa_free_ratio_daily$$);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mv_event_mix_90d_hourly') THEN
        PERFORM cron.schedule('mv_event_mix_90d_hourly', '0 * * * *',
            $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_event_mix_90d$$);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mv_organizer_debt_hourly') THEN
        PERFORM cron.schedule('mv_organizer_debt_hourly', '0 * * * *',
            $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_organizer_debt$$);
    END IF;
END $$;

COMMIT;
