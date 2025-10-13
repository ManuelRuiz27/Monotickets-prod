'use client';

import React from 'react';
import { getDirectorOverview, DirectorOverview, PaymentStatus } from '@/lib/api/director';
import { colors, spacing, typography, cardStyles, parseStyles } from '@shared/theme';
import { KpiSummary } from '../_components/KpiSummary';

export default function DirectorOverviewPage() {
  const [overview, setOverview] = React.useState<DirectorOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const cardStyle = React.useMemo(() => parseStyles(cardStyles), []);

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
        <>
          <section style={totalsGrid} aria-label="Totales financieros">
            {renderTotalCard('Ingresos', overview.totals.revenue, overview.totals.currency, cardStyle)}
            {renderTotalCard('Cuentas por cobrar', overview.totals.outstanding, overview.totals.currency, cardStyle)}
            {renderTotalCard('Comisiones estimadas', overview.totals.commissions, overview.totals.currency, cardStyle)}
          </section>
          <section style={{ ...cardStyle, marginTop: spacing.lg }}>
            <header style={sectionHeader}>
              <h2 style={sectionTitle}>Resumen de pagos</h2>
              <p style={sectionSubtitle}>
                Pendientes {overview.paymentSummary.pending} · Pagados {overview.paymentSummary.paid} · Fallidos {overview.paymentSummary.failed}
              </p>
            </header>
            <ol style={paymentsList}>
              {overview.recentPayments.map((payment) => (
                <li key={payment.id} style={paymentItem}>
                  <div>
                    <span style={paymentName}>{payment.organizerName}</span>
                    <span style={paymentMeta}>
                      {new Date(payment.paidAt).toLocaleDateString()} · {payment.method}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={paymentAmount}>{formatCurrency(payment.amount, payment.currency)}</span>
                    <span style={statusBadge(payment.status)}>{statusLabel(payment.status)}</span>
                  </div>
                </li>
              ))}
              {overview.recentPayments.length === 0 && (
                <li style={paymentMeta}>Aún no hay pagos registrados.</li>
              )}
            </ol>
          </section>
          <p style={footnoteStyle}>
            Última actualización: {new Date(overview.updatedAt).toLocaleString()}
          </p>
        </>
      )}
    </main>
  );
}

function renderTotalCard(title: string, value: number, currency: string, style: React.CSSProperties) {
  return (
    <article key={title} style={style}>
      <h2 style={sectionTitle}>{title}</h2>
      <p style={paymentAmount}>{formatCurrency(value, currency)}</p>
    </article>
  );
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value);
}

function statusLabel(status: PaymentStatus) {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'paid':
      return 'Pagado';
    case 'failed':
      return 'Fallido';
    default:
      return status;
  }
}

function statusBadge(status: PaymentStatus): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    padding: '4px 8px',
    borderRadius: '999px',
    fontFamily: typography.body,
    fontSize: '0.75rem',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  };
  if (status === 'pending') {
    return { ...base, backgroundColor: 'rgba(255, 159, 28, 0.18)', color: colors.warning };
  }
  if (status === 'failed') {
    return { ...base, backgroundColor: 'rgba(239, 71, 111, 0.18)', color: colors.danger };
  }
  return { ...base, backgroundColor: 'rgba(27, 153, 139, 0.18)', color: colors.success };
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

const totalsGrid: React.CSSProperties = {
  display: 'grid',
  gap: spacing.lg,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  marginTop: spacing.lg,
};

const sectionHeader: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  marginBottom: spacing.md,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.25rem',
  color: colors.navy,
  margin: 0,
};

const sectionSubtitle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const paymentsList: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gap: spacing.sm,
};

const paymentItem: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: spacing.md,
  paddingBottom: spacing.sm,
  borderBottom: `1px solid rgba(13, 27, 42, 0.08)`,
};

const paymentName: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
};

const paymentMeta: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  fontSize: '0.9rem',
};

const paymentAmount: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.25rem',
  margin: 0,
};
