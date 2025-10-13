'use client';

import React from 'react';
import { getDirectorOverview, DirectorOverview } from '@/lib/api/director';
import { colors, spacing, typography } from '@shared/theme';
import { KpiSummary } from '../_components/KpiSummary';

export default function DirectorOverviewPage() {
  const [overview, setOverview] = React.useState<DirectorOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDirectorOverview();
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos obtener los indicadores');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <main aria-labelledby="director-overview-title" style={{ padding: spacing.xl }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}>
        <div>
          <h1 id="director-overview-title" style={titleStyle}>
            Panel del director
          </h1>
          <p style={subtitleStyle}>Resumen ejecutivo de la operación comercial.</p>
        </div>
        <button type="button" onClick={load} style={refreshButtonStyle}>
          Actualizar
        </button>
      </header>
      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}
      <KpiSummary overview={overview} loading={loading} />
      {overview && (
        <p style={footnoteStyle}>
          Última actualización: {new Date(overview.updatedAt).toLocaleString()}
        </p>
      )}
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const refreshButtonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: '12px',
  border: `1px solid ${colors.sky}`,
  backgroundColor: colors.white,
  color: colors.sky,
  fontFamily: typography.subtitle,
};

const alertStyle: React.CSSProperties = {
  marginTop: spacing.md,
  marginBottom: spacing.md,
  padding: spacing.md,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.12)',
  color: colors.danger,
  fontFamily: typography.body,
};

const footnoteStyle: React.CSSProperties = {
  marginTop: spacing.lg,
  fontFamily: typography.body,
  color: colors.lightGray,
};
