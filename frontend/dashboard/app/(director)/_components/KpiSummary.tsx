'use client';

import React from 'react';
import type { DirectorOverview } from '@/lib/api/director';
import { colors, typography, spacing, cardStyles } from '@shared/theme';

const cardStyle = parseStyles(cardStyles);

interface KpiSummaryProps {
  overview?: DirectorOverview | null;
  loading?: boolean;
}

export function KpiSummary({ overview, loading }: KpiSummaryProps) {
  const items = [
    {
      id: 'events',
      title: 'Eventos por tipo',
      description: 'Distribución de plantillas Estándar y Premium',
      value: overview
        ? `${overview.eventsByType.standard} Estándar · ${overview.eventsByType.premium} Premium`
        : '—',
    },
    {
      id: 'organizers',
      title: 'Organizadores activos (90 días)',
      description: 'Organizadores que generaron eventos en los últimos 90 días',
      value: overview ? String(overview.activeOrganizers) : '—',
    },
    {
      id: 'tickets',
      title: 'Tickets generados',
      description: 'Total histórico de tickets emitidos',
      value: overview ? overview.ticketsGenerated.toLocaleString() : '—',
    },
  ];

  return (
    <section style={gridStyle} aria-live="polite">
      {items.map((item) => (
        <article key={item.id} style={cardStyle} aria-labelledby={`${item.id}-title`}>
          <h2 id={`${item.id}-title`} style={titleStyle}>
            {item.title}
          </h2>
          <p id={`${item.id}-description`} style={descriptionStyle}>
            {item.description}
          </p>
          <p style={valueStyle} aria-describedby={`${item.id}-description`}>
            {loading && !overview ? 'Cargando…' : item.value}
          </p>
        </article>
      ))}
    </section>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.lg,
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
};

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.25rem',
  color: colors.navy,
  margin: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  marginBottom: spacing.sm,
};

const valueStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
  fontSize: '2rem',
  margin: 0,
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
