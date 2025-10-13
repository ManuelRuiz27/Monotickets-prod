import { randomUUID } from 'node:crypto';

import { query } from '../db/index.js';
import { ensureRedis } from '../redis/client.js';
import { createLogger } from '../logging.js';
import { createDirectorModule } from '../modules/director.js';

const KPI_VIEWS = [
  'mv_kpi_tickets_entregados',
  'mv_kpi_deuda_abierta',
  'mv_kpi_top_organizadores',
  'mv_kpi_confirm_rate',
  'mv_kpi_time_to_confirm',
  'mv_kpi_wa_sessions_ratio',
  'mv_kpi_show_up_rate',
  'mv_kpi_landing_visits',
];

const DEFAULT_LOCK_TTL_SECONDS = 900;

export async function runKpiRefreshJob(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || createLogger({ env, service: env.SERVICE_NAME || 'workers' });
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const redis = await ensureRedis({ name: 'kpi-refresh', env });
  const lockKey = env.KPI_REFRESH_LOCK_KEY || 'locks:kpi-refresh';
  const lockId = randomUUID();
  const lockTtl = Number(env.KPI_REFRESH_LOCK_TTL_SECONDS || DEFAULT_LOCK_TTL_SECONDS);

  if (!force) {
    const acquired = await redis.set(lockKey, lockId, 'NX', 'EX', lockTtl);
    if (acquired !== 'OK') {
      logger({ level: 'info', message: 'kpi_refresh_skipped_lock_held' });
      return;
    }
  }

  try {
    logger({ level: 'info', message: 'kpi_refresh_started', dry_run: dryRun });

    if (!dryRun) {
      for (const viewName of KPI_VIEWS) {
        try {
          await query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
          logger({ level: 'info', message: 'kpi_view_refreshed', view: viewName });
        } catch (error) {
          logger({ level: 'warn', message: 'kpi_view_refresh_failed', view: viewName, error: error.message });
        }
      }
    }

    if (!dryRun) {
      const directorModule = createDirectorModule({ env, logger });
      await directorModule.getOverviewReport({ filters: {}, skipCache: false, prewarm: true });
      await directorModule.getTopOrganizersReport({ filters: { limit: 10 }, prewarm: true });
      await directorModule.getDebtAgingReport({ filters: {}, prewarm: true });
      await directorModule.getTicketsUsageReport({ filters: {}, prewarm: true });
    }

    logger({ level: 'info', message: 'kpi_refresh_completed', dry_run: dryRun });
  } finally {
    if (!force) {
      const current = await redis.get(lockKey);
      if (current === lockId) {
        await redis.del(lockKey);
      }
    }
  }
}
