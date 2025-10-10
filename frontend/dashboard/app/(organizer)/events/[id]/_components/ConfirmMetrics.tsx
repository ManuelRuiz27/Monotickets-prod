'use client';

import React from 'react';
import { ConfirmationMetrics } from '../../../../../lib/api/organizer';
import { colors, typography, spacing, cardStyles } from '../../../../../shared/theme';

interface ConfirmMetricsProps {
  metrics?: ConfirmationMetrics;
}

const cardStyle = parseStyles(cardStyles);

export function ConfirmMetrics({ metrics }: ConfirmMetricsProps) {
  if (!metrics) {
    return (
      <section aria-live="polite" style={cardStyle}>
        <h3 style={headingStyle}>Métricas de confirmación</h3>
        <p style={bodyStyle}>Sin datos de confirmación todavía.</p>
      </section>
    );
  }

  const showUpRate = metrics.confirmedGuests
    ? Math.round((metrics.scannedGuests / metrics.confirmedGuests) * 100)
    : 0;

  return (
    <section aria-live="polite" style={cardStyle}>
      <h3 style={headingStyle}>Métricas de confirmación</h3>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.md }}>
        <div>
          <dt style={dtStyle}>Tasa de confirmación</dt>
          <dd style={ddStyle}>{Math.round(metrics.confirmationRate * 100)}%</dd>
        </div>
        <div>
          <dt style={dtStyle}>Tiempo medio para confirmar</dt>
          <dd style={ddStyle}>{metrics.averageConfirmationTimeMinutes} min</dd>
        </div>
        <div>
          <dt style={dtStyle}>Confirmados</dt>
          <dd style={ddStyle}>{metrics.confirmedGuests}</dd>
        </div>
        <div>
          <dt style={dtStyle}>Escaneados (show-up)</dt>
          <dd style={ddStyle}>
            {metrics.scannedGuests} ({showUpRate}%)
          </dd>
        </div>
      </dl>
    </section>
  );
}

const headingStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.25rem',
  marginBottom: spacing.md,
  color: colors.navy,
};

const bodyStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
};

const dtStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  marginBottom: spacing.xs,
};

const ddStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.navy,
  fontSize: '1.5rem',
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
