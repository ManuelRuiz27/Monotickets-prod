'use client';

import React from 'react';
import { getEvents, EventSummary } from '../../../../lib/api/organizer';
import { colors, typography, spacing, cardStyles } from '../../../../shared/theme';

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  fontSize: '2rem',
  color: colors.navy,
  marginBottom: spacing.lg,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: spacing.lg,
};

const cardStyle = parseStyles(cardStyles);

export default function OrganizerDashboardPage() {
  const [events, setEvents] = React.useState<EventSummary[]>([]);
  const [page, setPage] = React.useState(1);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getEvents(page)
      .then((response) => {
        if (cancelled) return;
        setEvents(response.data);
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
  }, [page]);

  return (
    <main aria-labelledby="organizer-dashboard-title" style={{ padding: spacing.xl }}>
      <h1 id="organizer-dashboard-title" style={titleStyle}>
        Panel del organizador
      </h1>
      {error && (
        <div role="alert" style={{ color: colors.danger, marginBottom: spacing.md }}>
          Ocurrió un error al cargar los eventos. {error}
        </div>
      )}
      {loading ? (
        <p>Loading events…</p>
      ) : (
        <section aria-live="polite">
          {events.length === 0 ? (
            <p>
              No hay eventos. Crea tu primer evento con el botón “Nuevo evento” en la parte superior del sitio.
            </p>
          ) : (
            <div style={gridStyle}>
              {events.map((event) => (
                <article key={event.id} style={cardStyle} aria-labelledby={`event-${event.id}-title`}>
                  <h2
                    id={`event-${event.id}-title`}
                    style={{
                      fontFamily: typography.subtitle,
                      fontSize: '1.25rem',
                      marginBottom: spacing.sm,
                      color: colors.navy,
                    }}
                  >
                    {event.name}
                  </h2>
                  <p style={{ fontFamily: typography.body, color: colors.navy }}>
                    {new Date(event.start_date).toLocaleString()}
                  </p>
                  <p style={{ fontFamily: typography.body, color: colors.lightGray }}>
                    Estado: {event.status}
                  </p>
                  <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
                    <a
                      href={`/dashboard/events/${event.id}`}
                      style={{
                        color: colors.sky,
                        fontFamily: typography.subtitle,
                        textDecoration: 'underline',
                      }}
                    >
                      Ver
                    </a>
                    <a
                      href={`/dashboard/events/${event.id}/edit`}
                      style={{
                        color: colors.sky,
                        fontFamily: typography.subtitle,
                        textDecoration: 'underline',
                      }}
                    >
                      Editar
                    </a>
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
        <button type="button" onClick={() => setPage((p) => p + 1)}>Página siguiente</button>
      </nav>
    </main>
  );
}

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
