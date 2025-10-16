-- Requiere extensión pg_cron
SELECT cron.schedule('*/5 * * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_confirmation_rate_daily$$);
SELECT cron.schedule('*/5 * * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_show_up_rate_daily$$);
SELECT cron.schedule('*/10 * * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_wa_free_ratio_daily$$);
SELECT cron.schedule('0 * * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_event_mix_90d$$);
SELECT cron.schedule('0 * * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_organizer_debt$$);
