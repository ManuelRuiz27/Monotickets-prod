'use client';

import React from 'react';
import { KpiOverview } from '../../../lib/api/director';
import { colors, typography, spacing, cardStyles } from '../../../shared/theme';

const cardStyle = parseStyles(cardStyles);

interface KpiCardsProps {
  overview?: KpiOverview;
}

export function KpiCards({ overview }: KpiCardsProps) {
  return (
    <section
      aria-label="Indicadores clave"
      style={{ display: 'grid', gap: spacing.md, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
    >
      <article style={cardStyle}>
        <h3 style={titleStyle}>Tickets generados</h3>
        <p style={valueStyle}>{overview?.ticketsGenerated ?? '—'}</p>
      </article>
      <article style={cardStyle}>
        <h3 style={titleStyle}>Clientes activos</h3>
        <p style={valueStyle}>{overview?.activeCustomers ?? '—'}</p>
      </article>
      <article style={cardStyle}>
        <h3 style={titleStyle}>Deuda pendiente</h3>
        <p style={valueStyle}>${overview?.outstandingDebt?.toLocaleString() ?? '—'}</p>
      </article>
      <article style={cardStyle}>
        <h3 style={titleStyle}>Pagos recientes</h3>
        <p style={valueStyle}>{overview?.recentPayments?.length ?? 0}</p>
      </article>
    </section>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
};

const valueStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.sky,
  fontSize: '2rem',
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
