'use client';

import React from 'react';
import Link from 'next/link';
import {
  getEvents,
  EventSummary,
  EventStatus,
  LandingKind,
} from '../../../../lib/api/organizer';
import { colors, typography, spacing, cardStyles, buttonStyles } from '../../../../shared/theme';

const cardStyle = parseStyles(cardStyles);
const primaryButton = parseStyles(buttonStyles.primary);
const secondaryButton = parseStyles(buttonStyles.secondary);

const statusLabels: Record<EventStatus, string> = {
  draft: 'Borrador',
  live: 'En curso',
  completed: 'Finalizado',
};

const kindLabels: Record<LandingKind, string> = {
  standard: 'Estándar',
  premium: 'Premium',
};

export default function OrganizerDashboardPage() {
  const [events, setEvents] = React.useState<EventSummary[]>([]);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<EventStatus | 'all'>('all');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const selectedStatus = status === 'all' ? undefined : status;
    getEvents(page, selectedStatus)
      .then((response) => {
        if (cancelled) return;
        setEvents(response.data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, status]);

  return (
    <main aria-labelledby="organizer-dashboard-title" style={{ padding: spacing.xl }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}>
        <div>
          <h1 id="organizer-dashboard-title" style={titleStyle}>
            Panel del organizador
          </h1>
          <p style={subtitleStyle}>
            Revisa el estado de tus eventos, crea nuevos y gestiona la confirmación de tus invitados.
          </p>
        </div>
        <Link href="/dashboard/events/new" style={{ ...primaryButton, textDecoration: 'none' }}>
          Nuevo evento
        </Link>
      </header>
      <section
        aria-label="Filtros de eventos"
        style={{
          display: 'flex',
          gap: spacing.md,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: spacing.lg,
        }}
      >
        <label htmlFor="event-status-filter" style={filterLabelStyle}>
          Estado
          <select
            id="event-status-filter"
            style={selectStyle}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as EventStatus | 'all');
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="draft">Borradores</option>
            <option value="live">Previo / en vivo</option>
            <option value="completed">Finalizados</option>
          </select>
        </label>
      </section>
      {error && (
        <div role="alert" style={{ ...alertStyle }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button type="button" onClick={() => setStatus((current) => current)} style={retryButtonStyle}>
            Reintentar
          </button>
        </div>
      )}
      {loading ? (
        <p role="status" style={subtitleStyle}>
          Cargando eventos…
        </p>
      ) : (
        <section aria-live="polite">
          {events.length === 0 ? (
            <div style={emptyStateStyle}>
              <p style={subtitleStyle}>No hay eventos para el filtro seleccionado.</p>
              <Link href="/dashboard/events/new" style={{ ...primaryButton, textDecoration: 'none' }}>
                Crear un evento
              </Link>
            </div>
          ) : (
            <div style={gridStyle}>
              {events.map((event) => (
                <article key={event.id} style={cardStyle} aria-labelledby={`event-${event.id}-title`}>
                  <h2 id={`event-${event.id}-title`} style={cardTitleStyle}>
                    {event.name}
                  </h2>
                  <p style={cardMetaStyle}>
                    {new Date(event.start_date).toLocaleString()} {event.end_date && `— ${new Date(event.end_date).toLocaleString()}`}
                  </p>
                  <p style={cardMetaStyle}>
                    Tipo: {kindLabels[event.type]} · Landing: {kindLabels[event.landing_kind]}
                  </p>
                  <p style={cardMetaStyle}>Estado: {statusLabels[event.status]}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
                    <Link href={`/dashboard/events/${event.id}`} style={{ ...secondaryButton, textDecoration: 'none' }}>
                      Ver
                    </Link>
                    <Link href={`/dashboard/events/${event.id}/edit`} style={{ ...secondaryButton, textDecoration: 'none' }}>
                      Editar
                    </Link>
                    <Link href={`/dashboard/events/${event.id}#guests`} style={{ ...secondaryButton, textDecoration: 'none' }}>
                      Invitados
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <nav aria-label="Paginación de eventos" style={{ marginTop: spacing.lg, display: 'flex', gap: spacing.sm }}>
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Página anterior
        </button>
        <span style={{ alignSelf: 'center', fontFamily: typography.body }}>Página {page}</span>
        <button type="button" onClick={() => setPage((p) => p + 1)}>
          Página siguiente
        </button>
      </nav>
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  fontSize: '2.25rem',
  color: colors.navy,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.navy,
  margin: 0,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: spacing.lg,
};

const cardTitleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.4rem',
  color: colors.navy,
  marginBottom: spacing.xs,
};

const cardMetaStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  marginBottom: spacing.xs,
};

const filterLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const selectStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: '8px',
  border: `1px solid ${colors.lightGray}`,
  fontFamily: typography.body,
};

const alertStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing.sm,
  padding: spacing.md,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.1)',
  color: colors.danger,
  marginBottom: spacing.lg,
};

const retryButtonStyle: React.CSSProperties = {
  ...parseStyles(buttonStyles.ghost),
  textDecoration: 'none',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};

const emptyStateStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  alignItems: 'center',
  justifyItems: 'center',
  padding: spacing.xl,
  borderRadius: '16px',
  background: 'rgba(13,27,42,0.05)',
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
