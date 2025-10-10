'use client';

import React from 'react';
import {
  getEvent,
  getEventGuests,
  sendInvitation,
  EventDetail,
  Guest,
} from '../../../../lib/api/organizer';
import { colors, spacing, typography, cardStyles } from '../../../../shared/theme';
import { Tabs, TabTrigger, TabPanel } from '../../../../lib/ui/tabs';
import { ConfirmMetrics } from './_components/ConfirmMetrics';

interface PageProps {
  params: { id: string };
}

const cardStyle = parseStyles(cardStyles);

export default function EventDashboardPage({ params }: PageProps) {
  const { id } = params;
  const [event, setEvent] = React.useState<EventDetail | null>(null);
  const [guests, setGuests] = React.useState<Guest[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [eventResponse, guestResponse] = await Promise.all([
          getEvent(id),
          getEventGuests(id),
        ]);
        if (cancelled) return;
        setEvent(eventResponse);
        setGuests(guestResponse);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSendInvitation = React.useCallback(
    async (guestId: string) => {
      try {
        await sendInvitation(id, guestId);
        const updatedGuests = await getEventGuests(id);
        setGuests(updatedGuests);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al enviar invitación');
      }
    },
    [id]
  );

  const confirmed = guests.filter((guest) => guest.status !== 'pending');
  const pending = guests.filter((guest) => guest.status === 'pending');
  const scanned = guests.filter((guest) => guest.status === 'scanned');

  return (
    <main aria-labelledby="event-dashboard-title" style={{ padding: spacing.xl }}>
      {loading && <p>Cargando evento…</p>}
      {error && (
        <div role="alert" style={{ color: colors.danger, marginBottom: spacing.md }}>
          {error}
        </div>
      )}
      {event && (
        <>
          <header style={{ marginBottom: spacing.lg }}>
            <h1 id="event-dashboard-title" style={titleStyle}>
              {event.name}
            </h1>
            <p style={{ fontFamily: typography.body, color: colors.lightGray }}>
              {new Date(event.start_date).toLocaleString()} — {event.type === 'premium' ? 'Premium' : 'Estándar'}
            </p>
          </header>
          <Tabs defaultValue="preview" aria-label="Tabs del evento">
            <TabTrigger value="preview">Previo</TabTrigger>
            <TabTrigger value="live">Live</TabTrigger>
            <TabPanel value="preview">
              <section style={{ ...cardStyle, marginBottom: spacing.lg }}>
                <h2 style={sectionHeading}>Invitados</h2>
                <p style={{ fontFamily: typography.body }}>
                  Pendientes: {pending.length} · Confirmados: {confirmed.length} · Escaneados: {scanned.length}
                </p>
                <button type="button" onClick={() => window.alert('Import CSV no disponible en placeholder')}>
                  Importar CSV
                </button>
              </section>
              <section style={cardStyle}>
                <h3 style={sectionHeading}>Enviar invitaciones</h3>
                <ul>
                  {pending.length === 0 && <li>No hay invitados pendientes.</li>}
                  {pending.map((guest) => (
                    <li key={guest.id} style={{ marginBottom: spacing.sm }}>
                      <span>{guest.name}</span>
                      <button type="button" onClick={() => handleSendInvitation(guest.id)}>
                        Enviar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </TabPanel>
            <TabPanel value="live">
              <ConfirmMetrics metrics={event.metrics} />
              <section style={{ ...cardStyle, marginTop: spacing.lg }}>
                <h2 style={sectionHeading}>Latido en vivo</h2>
                <p style={{ fontFamily: typography.body }}>
                  Los datos se actualizan cada 10 segundos. Implementa WebSocket/SSE para métricas en tiempo real.
                </p>
              </section>
            </TabPanel>
          </Tabs>
        </>
      )}
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
  fontSize: '2rem',
};

const sectionHeading: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  marginBottom: spacing.sm,
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
