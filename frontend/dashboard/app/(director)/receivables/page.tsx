'use client';

import React from 'react';
import { getReceivables, type ReceivableRecord } from '@/lib/api/director';
import { spacing, typography, colors } from '@shared/theme';
import { ReceivablesList } from '../_components/ReceivablesList';

export default function ReceivablesPage() {
  const [filter, setFilter] = React.useState<ReceivableRecord['agingBucket'] | 'all'>('all');
  const [receivables, setReceivables] = React.useState<ReceivableRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (current: ReceivableRecord['agingBucket'] | 'all') => {
    setLoading(true);
    try {
      const data = await getReceivables(current === 'all' ? undefined : current);
      setReceivables(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cartera.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(filter);
  }, [filter, load]);

  return (
    <main aria-labelledby="receivables-title" style={{ padding: spacing.xl }}>
      <header style={headerStyle}>
        <div>
          <h1 id="receivables-title" style={titleStyle}>
            Cuentas por cobrar
          </h1>
          <p style={subtitleStyle}>
            Controla la deuda abierta por organizador y consulta la antigüedad de los saldos.
          </p>
        </div>
      </header>
      {error && (
        <div role="alert" style={errorBanner}>
          {error}
        </div>
      )}
      <ReceivablesList receivables={receivables} filter={filter} onFilterChange={setFilter} loading={loading} />
    </main>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: spacing.md,
  marginBottom: spacing.lg,
};

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

const errorBanner: React.CSSProperties = {
  marginBottom: spacing.md,
  padding: spacing.md,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.12)',
  color: colors.danger,
  fontFamily: typography.body,
};
