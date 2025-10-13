'use client';

import React from 'react';
import type { ConfirmationMetrics } from '@/lib/api/organizer';
import { colors, typography, spacing, cardStyles, parseStyles } from '@shared/theme';

interface StatsProps {
  metrics?: ConfirmationMetrics;
  loading?: boolean;
}

const cardStyle = parseStyles(cardStyles);

export function Stats({ metrics, loading }: StatsProps) {
  const isLoading = loading || !metrics;
  const freeSessions = metrics?.whatsapp.freeSessions ?? 0;
  const paidTemplates = metrics?.whatsapp.paidTemplates ?? 0;
  const hasPaidTemplates = paidTemplates > 0;
  const whatsappRatio = metrics?.whatsapp.ratio ?? 0;
  const whatsappSummary = hasPaidTemplates
    ? `${freeSessions} ${freeSessions === 1 ? 'sesión gratuita' : 'sesiones gratuitas'} / ${paidTemplates} ${
        paidTemplates === 1 ? 'plantilla de pago' : 'plantillas de pago'
      }`
    : `${freeSessions} ${freeSessions === 1 ? 'sesión gratuita' : 'sesiones gratuitas'}`;
  const whatsappHint = hasPaidTemplates
    ? `Ratio ${whatsappRatio.toFixed(2)}:1 (gratuitas/pago)`
    : 'Sin plantillas de pago registradas';

  return (
    <section
      aria-live="polite"
      aria-busy={isLoading}
      style={{ display: 'grid', gap: spacing.md }}
    >
      <header>
        <p style={eyebrowStyle}>Seguimiento en tiempo real</p>
        <h2 style={titleStyle}>Estadísticas clave</h2>
      </header>
      <div style={gridStyle}>
        <article style={cardStyle}>
          <h3 style={metricTitleStyle}>Tasa de confirmación</h3>
          {isLoading ? (
            <div style={skeletonLarge} aria-hidden="true" />
          ) : (
            <p style={metricValueStyle}>
              {metrics.confirmationRate.toFixed(1)}%
              <span style={metricHintStyle}>
                {metrics.confirmedGuests + metrics.scannedGuests} de {metrics.totalGuests} invitados confirmados
              </span>
            </p>
          )}
        </article>
        <article style={cardStyle}>
          <h3 style={metricTitleStyle}>Show-up rate</h3>
          {isLoading ? (
            <div style={skeletonLarge} aria-hidden="true" />
          ) : (
            <p style={metricValueStyle}>
              {metrics.showUpRate.toFixed(1)}%
              <span style={metricHintStyle}>
                {metrics.scannedGuests} escaneados / {metrics.confirmedGuests + metrics.scannedGuests} confirmados
              </span>
            </p>
          )}
        </article>
        <article style={cardStyle}>
          <h3 style={metricTitleStyle}>Sesiones gratuitas vs pago</h3>
          {isLoading ? (
            <div style={skeletonLarge} aria-hidden="true" />
          ) : (
            <p style={metricValueStyle}>
              {whatsappSummary}
              <span style={metricHintStyle}>{whatsappHint}</span>
            </p>
          )}
        </article>
      </div>
      {!isLoading && (
        <p style={footnoteStyle}>
          Última actualización {new Date(metrics.lastUpdatedAt).toLocaleTimeString()}
        </p>
      )}
    </section>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: spacing.md,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: 0,
};

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.5rem',
  margin: 0,
};

const metricTitleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1rem',
  color: colors.lightGray,
  marginBottom: spacing.sm,
};

const metricValueStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
  fontSize: '2rem',
  margin: 0,
  display: 'grid',
  gap: spacing.xs,
};

const metricHintStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  fontSize: '0.9rem',
};

const footnoteStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const skeletonLarge: React.CSSProperties = {
  height: '42px',
  borderRadius: '12px',
  background: 'linear-gradient(90deg, rgba(224,224,224,0.4), rgba(176,176,176,0.45), rgba(224,224,224,0.4))',
};
