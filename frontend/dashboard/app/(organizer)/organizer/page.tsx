'use client';

import React from 'react';
import Link from 'next/link';
import {
  getEvents,
  type EventSummary,
  type EventStatus,
  type LandingKind,
} from '@/lib/api/organizer';
import {
  colors,
  typography,
  spacing,
  cardStyles,
  buttonStyles,
  parseStyles,
} from '@shared/theme';
import { Filters, type OrganizerFilters } from './_components/Filters';

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

const INITIAL_FILTERS: OrganizerFilters = {
  search: '',
  type: 'all',
  status: 'all',
  from: undefined,
  to: undefined,
};

export default function OrganizerDashboardPage() {
  const [events, setEvents] = React.useState<EventSummary[]>([]);
  const [filters, setFilters] = React.useState<OrganizerFilters>(INITIAL_FILTERS);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(6);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const response = await getEvents({
          page,
          search: filters.search || undefined,
          status: filters.status === 'all' ? undefined : filters.status,
          type: filters.type === 'all' ? undefined : filters.type,
          startsAt: filters.from,
          endsAt: filters.to,
        });
        if (cancelled) return;
        setEvents(response.data);
        setTotal(response.total);
        setPageSize(response.pageSize || 6);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'No pudimos cargar los eventos.';
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showEmpty = !loading && events.length === 0;

  return (
    <main aria-labelledby="organizer-dashboard-title" style={{ padding: spacing.xl }}>
      <header style={headerStyle}>
        <div>
          <h1 id="organizer-dashboard-title" style={titleStyle}>
            Panel del organizador
          </h1>
          <p style={subtitleStyle}>
            Revisa el estado de tus eventos, filtra por periodo y administra invitaciones desde un solo lugar.
          </p>
        </div>
        <Link href="/dashboard/events/new" style={{ ...primaryButton, textDecoration: 'none' }}>
          Nuevo evento
        </Link>
      </header>

      <section aria-label="Filtros de eventos" style={{ marginBottom: spacing.lg }}>
        <Filters
          value={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            setPage(1);
          }}
          onReset={() => {
            setFilters(INITIAL_FILTERS);
            setPage(1);
          }}
        />
      </section>

      {error && (
        <div role="alert" aria-live="assertive" style={alertStyle}>
          <p style={{ margin: 0 }}>{error}</p>
          <button
            type="button"
            onClick={() => setFilters((current) => ({ ...current }))}
            style={retryButtonStyle}
          >
            Reintentar
          </button>
        </div>
      )}

      <section aria-live="polite" aria-busy={loading}>
        {loading && (
          <div style={gridStyle}>
            {Array.from({ length: 3 }).map((_, index) => (
              <article key={`skeleton-${index}`} style={{ ...cardStyle, minHeight: '200px' }} aria-hidden="true">
                <div style={skeletonTitleStyle} />
                <div style={skeletonLineStyle} />
                <div style={skeletonLineStyle} />
                <div style={{ ...skeletonLineStyle, width: '60%' }} />
              </article>
            ))}
          </div>
        )}

        {showEmpty && (
          <div style={emptyStateStyle}>
            <p style={subtitleStyle}>No hay eventos que coincidan con los filtros seleccionados.</p>
            <Link href="/dashboard/events/new" style={{ ...primaryButton, textDecoration: 'none' }}>
              Crear un evento
            </Link>
          </div>
        )}

        {!loading && !showEmpty && (
          <>
            <p style={resultsSummary}>
              {total === events.length
                ? `${events.length} eventos encontrados`
                : `${events.length} de ${total} eventos mostrados`}
            </p>
            <div style={gridStyle}>
              {events.map((event) => (
                <article key={event.id} style={cardStyle} aria-labelledby={`event-${event.id}-title`}>
                  <h2 id={`event-${event.id}-title`} style={cardTitleStyle}>
                    {event.name}
                  </h2>
                  <p style={cardMetaStyle}>
                    {new Date(event.startsAt).toLocaleString()}
                    {event.endsAt && ` — ${new Date(event.endsAt).toLocaleString()}`}
                  </p>
                  <p style={cardMetaStyle}>
                    Tipo: {kindLabels[event.type]} · Landing: {kindLabels[event.landingKind]}
                  </p>
                  <p style={cardMetaStyle}>Estado: {statusLabels[event.status]}</p>
                  <div style={cardActionsStyle}>
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
          </>
        )}
      </section>

      <nav aria-label="Paginación de eventos" style={paginationStyle}>
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page === 1}
          style={{ ...secondaryButton, minWidth: '160px' }}
        >
          Página anterior
        </button>
        <span style={{ alignSelf: 'center', fontFamily: typography.body }}>
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages}
          style={{ ...secondaryButton, minWidth: '160px' }}
        >
          Página siguiente
        </button>
      </nav>
    </main>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: spacing.md,
  marginBottom: spacing.lg,
};

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  fontSize: '2.25rem',
  color: colors.navy,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
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

const cardActionsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing.sm,
  marginTop: spacing.md,
};

const resultsSummary: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  marginBottom: spacing.sm,
};

const paginationStyle: React.CSSProperties = {
  marginTop: spacing.lg,
  display: 'flex',
  gap: spacing.sm,
  justifyContent: 'center',
  flexWrap: 'wrap',
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
  padding: 0,
};

const emptyStateStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  alignItems: 'center',
  justifyItems: 'center',
  padding: spacing.xl,
  borderRadius: '16px',
  background: 'rgba(13, 27, 42, 0.05)',
  textAlign: 'center',
};

const skeletonTitleStyle: React.CSSProperties = {
  height: '28px',
  width: '75%',
  borderRadius: '8px',
  background: 'linear-gradient(90deg, rgba(176,176,176,0.25), rgba(176,176,176,0.45), rgba(176,176,176,0.25))',
};

const skeletonLineStyle: React.CSSProperties = {
  height: '16px',
  width: '85%',
  borderRadius: '8px',
  background: 'linear-gradient(90deg, rgba(224,224,224,0.4), rgba(176,176,176,0.45), rgba(224,224,224,0.4))',
  marginTop: spacing.sm,
};
