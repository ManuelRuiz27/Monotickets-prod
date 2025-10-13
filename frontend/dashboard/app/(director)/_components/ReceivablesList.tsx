'use client';

import React from 'react';
import type { ReceivableRecord } from '@/lib/api/director';
import { spacing, typography, colors, cardStyles, buttonStyles, parseStyles } from '@shared/theme';

interface ReceivablesListProps {
  receivables: ReceivableRecord[];
  filter: ReceivableRecord['agingBucket'] | 'all';
  onFilterChange: (value: ReceivableRecord['agingBucket'] | 'all') => void;
  loading?: boolean;
}

const cardStyle = parseStyles(cardStyles);
const tabButton = parseStyles(buttonStyles.ghost);

const FILTERS: { value: ReceivableRecord['agingBucket'] | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: '0-30', label: '0-30 días' },
  { value: '31-60', label: '31-60 días' },
  { value: '61-90', label: '61-90 días' },
  { value: '90+', label: '90+ días' },
];

export function ReceivablesList({ receivables, filter, onFilterChange, loading }: ReceivablesListProps) {
  return (
    <section style={{ display: 'grid', gap: spacing.md }} aria-live="polite">
      <header style={headerStyle}>
        <h2 style={titleStyle}>Cuentas por cobrar</h2>
        <nav aria-label="Filtrar por antigüedad" style={tabsStyle}>
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onFilterChange(item.value)}
              style={{
                ...tabButton,
                borderBottom: item.value === filter ? `2px solid ${colors.sky}` : '2px solid transparent',
                color: item.value === filter ? colors.navy : colors.lightGray,
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div style={listStyle}>
        {loading && <p style={helperStyle}>Cargando cartera…</p>}
        {!loading && receivables.length === 0 && (
          <p style={helperStyle}>No hay cuentas por cobrar para este rango.</p>
        )}
        {!loading &&
          receivables.map((item) => (
            <article key={item.organizerId} style={cardStyle}>
              <div style={rowStyle}>
                <div>
                  <h3 style={organizerStyle}>{item.organizerName}</h3>
                  {item.lastMovementNote && <p style={noteStyle}>{item.lastMovementNote}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={amountStyle}>{formatCurrency(item.amount, item.currency)}</p>
                  <p style={helperStyle}>{labelForBucket(item.agingBucket)}</p>
                </div>
              </div>
              <p style={helperStyle}>
                Último movimiento: {item.lastPaymentAt ? new Date(item.lastPaymentAt).toLocaleDateString() : 'Sin registro'}
              </p>
            </article>
          ))}
      </div>
    </section>
  );
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value);
}

function labelForBucket(bucket: ReceivableRecord['agingBucket']) {
  switch (bucket) {
    case '0-30':
      return '0-30 días';
    case '31-60':
      return '31-60 días';
    case '61-90':
      return '61-90 días';
    default:
      return 'Más de 90 días';
  }
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: spacing.sm,
};

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.4rem',
  color: colors.navy,
  margin: 0,
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: spacing.xs,
  flexWrap: 'wrap',
};

const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: spacing.md,
  alignItems: 'baseline',
};

const organizerStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  margin: 0,
};

const noteStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const amountStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.2rem',
  color: colors.navy,
  margin: 0,
};

const helperStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};
