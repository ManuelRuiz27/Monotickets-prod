'use client';

import React from 'react';
import { colors, typography, spacing, cardStyles } from '@shared/theme';

interface StageMetricsProps {
  stage: 'before' | 'during';
  pending: number;
  confirmed: number;
  scanned: number;
}

const cardStyle = parseStyles(cardStyles);

export function StageMetrics({ stage, pending, confirmed, scanned }: StageMetricsProps) {
  const items = stage === 'before'
    ? [
        { label: 'Pendientes por confirmar', value: pending },
        { label: 'Confirmados', value: confirmed },
        { label: 'Escaneados', value: scanned },
      ]
    : [
        { label: 'Confirmados', value: confirmed },
        { label: 'Escaneados', value: scanned },
        {
          label: 'Tasa show-up',
          value: confirmed > 0 ? `${Math.round((scanned / confirmed) * 100)}%` : '0%',
        },
      ];

  return (
    <section style={{ ...cardStyle, display: 'grid', gap: spacing.md }} aria-live="polite">
      <header>
        <p style={eyebrowStyle}>{stage === 'before' ? 'Previo al evento' : 'Durante el evento'}</p>
        <h2 style={titleStyle}>Métricas clave</h2>
      </header>
      <dl style={listStyle}>
        {items.map((item) => (
          <div key={item.label} style={itemStyle}>
            <dt style={dtStyle}>{item.label}</dt>
            <dd style={ddStyle}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: 0,
};

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.4rem',
  margin: 0,
};

const listStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: spacing.md,
};

const itemStyle: React.CSSProperties = {
  backgroundColor: 'rgba(13, 27, 42, 0.04)',
  borderRadius: '16px',
  padding: spacing.md,
};

const dtStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  marginBottom: spacing.xs,
};

const ddStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.75rem',
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
