'use client';

import React from 'react';
import Link from 'next/link';
import {
  getEvent,
  getEventGuests,
  sendInvitation,
  importGuests,
  sendBulkWhatsapp,
  generateWhatsappLink,
  Guest,
  EventDetail,
  ConfirmationState,
} from '@/lib/api/organizer';
import { colors, spacing, typography, cardStyles, buttonStyles, inputStyles, parseStyles } from '@shared/theme';
import { Tabs, TabTrigger, TabPanel } from '@/lib/ui/tabs';
import { StageMetrics } from './_components/StageMetrics';
import { Stats } from './_components/Stats';

const cardStyle = parseStyles(cardStyles);
const secondaryButton = parseStyles(buttonStyles.secondary);
const ghostButton = parseStyles(buttonStyles.ghost);
const inputStyle = parseStyles(inputStyles);

interface PageProps {
  params: { id: string };
}

export default function EventDashboardPage({ params }: PageProps) {
  const { id } = params;
  const [event, setEvent] = React.useState<EventDetail | null>(null);
  const [guests, setGuests] = React.useState<Guest[]>([]);
  const [scannedGuests, setScannedGuests] = React.useState<Guest[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<ConfirmationState | 'all'>('all');
  const [csvValue, setCsvValue] = React.useState('');
  const [importFeedback, setImportFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = React.useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = React.useState(false);

  const loadEvent = React.useCallback(async () => {
    try {
      const [eventData, guestData] = await Promise.all([getEvent(id), getEventGuests(id)]);
      setEvent(eventData);
      setGuests(guestData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadEvent().finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadEvent]);

  React.useEffect(() => {
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        setMetricsLoading(true);
        const updated = await getEvent(id);
        if (!cancelled) {
          setEvent((current) => (current ? { ...current, ...updated } : updated));
        }
      } catch (err) {
        if (!cancelled && process.env.NODE_ENV !== 'production') {
          console.warn('[event-dashboard] no se pudieron actualizar las métricas', err);
        }
      } finally {
        if (!cancelled) {
          setMetricsLoading(false);
        }
      }
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [id]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadScanned() {
      try {
        const data = await getEventGuests(id, { status: 'scanned' });
        if (!cancelled) {
          setScannedGuests(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los escaneados');
        }
      }
    }
    loadScanned();
    const interval = window.setInterval(loadScanned, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [id]);

  const filteredGuests = React.useMemo(() => {
    if (statusFilter === 'all') return guests;
    return guests.filter((guest) => guest.status === statusFilter);
  }, [guests, statusFilter]);

  const pending = guests.filter((guest) => guest.status === 'pending');
  const confirmed = guests.filter((guest) => guest.status === 'confirmed');
  const scanned = guests.filter((guest) => guest.status === 'scanned');

  const handleSendInvitation = React.useCallback(
    async (guestId: string) => {
      setSending(guestId);
      try {
        await sendInvitation(id, guestId);
        const refreshed = await getEventGuests(id);
        setGuests(refreshed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al enviar la invitación');
      } finally {
        setSending(null);
      }
    },
    [id]
  );

  const handleBulkWhatsapp = React.useCallback(async () => {
    try {
      setBulkMessage('Enviando invitaciones por WhatsApp…');
      const result = await sendBulkWhatsapp(id);
      setBulkMessage(`Se enviaron ${result.queued} mensajes.`);
    } catch (err) {
      setBulkMessage(
        err instanceof Error
          ? `Error al enviar mensajes: ${err.message}`
          : 'Error al enviar los mensajes'
      );
    }
  }, [id]);

  const handleImportCsv = React.useCallback(async () => {
    setImportFeedback(null);
    try {
      const result = await importGuests(id, { csv: csvValue });
      if (result.errors.length > 0) {
        setImportFeedback(
          `Se importaron ${result.imported} invitad@s, pero ${result.errors.length} filas requieren revisión.`
        );
      } else {
        setImportFeedback(`Se importaron ${result.imported} invitad@s correctamente.`);
      }
      const refreshed = await getEventGuests(id);
      setGuests(refreshed);
      setCsvValue('');
    } catch (err) {
      setImportFeedback(err instanceof Error ? err.message : 'No se pudo importar el CSV');
    }
  }, [csvValue, id]);

  const handleGenerateWhatsapp = React.useCallback(
    async (guestId?: string) => {
      try {
        const result = await generateWhatsappLink(id, guestId);
        window.open(result.link, '_blank', 'noopener');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo generar el enlace de WhatsApp');
      }
    },
    [id]
  );

  return (
    <main aria-labelledby="event-dashboard-title" style={{ padding: spacing.xl }}>
      {loading && <p>Cargando evento…</p>}
      {error && (
        <div role="alert" style={{ ...alertStyle }}>
          {error}
        </div>
      )}
      {event && (
        <>
          <header style={{ marginBottom: spacing.lg, display: 'grid', gap: spacing.xs }}>
            <p style={eyebrowStyle}>Gestión de evento</p>
            <h1 id="event-dashboard-title" style={titleStyle}>
              {event.name}
            </h1>
            <p style={subtitleStyle}>
              {new Date(event.startsAt).toLocaleString()} · {event.location ?? 'Ubicación por definir'}
            </p>
            <Link href={`/invite/${event.id}`} style={secondaryLinkStyle}>
              Ver landing pública
            </Link>
          </header>
          <div style={{ marginBottom: spacing.lg }}>
            <Stats metrics={event.metrics} loading={metricsLoading && Boolean(event.metrics)} />
          </div>
          <Tabs defaultValue="preview" aria-label="Tabs del evento">
            <TabTrigger value="preview">Previo</TabTrigger>
            <TabTrigger value="live">Durante</TabTrigger>
            <TabPanel value="preview">
              <StageMetrics stage="before" pending={pending.length} confirmed={confirmed.length} scanned={scanned.length} />
              <section id="guests" style={{ ...cardStyle, marginTop: spacing.lg }}>
              <header style={sectionHeaderStyle}>
                <h2 style={sectionHeading}>Invitados</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
                  <label htmlFor="guest-status-filter" style={filterLabelStyle}>
                    Estado
                    <select
                      id="guest-status-filter"
                      style={selectStyle}
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as ConfirmationState | 'all')}
                    >
                      <option value="all">Todos</option>
                      <option value="pending">Pendientes</option>
                      <option value="confirmed">Confirmados</option>
                      <option value="scanned">Escaneados</option>
                    </select>
                  </label>
                  <button type="button" style={secondaryButton} onClick={() => handleBulkWhatsapp()}>
                    Enviar invitaciones (WhatsApp)
                  </button>
                  <button type="button" style={ghostButton} onClick={() => handleGenerateWhatsapp()}>
                    Generar link general
                  </button>
                </div>
              </header>
              {bulkMessage && <p style={helperTextStyle}>{bulkMessage}</p>}
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Email</th>
                      <th scope="col">Teléfono</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuests.length === 0 && (
                      <tr>
                        <td colSpan={5} style={emptyCellStyle}>
                          No hay invitados con este filtro. Usa el importador o agrega manualmente.
                        </td>
                      </tr>
                    )}
                    {filteredGuests.map((guest) => (
                      <tr key={guest.id}>
                        <td>{guest.name}</td>
                        <td>{guest.email}</td>
                        <td>{formatPhone(guest.phone)}</td>
                        <td>{statusLabel(guest.status)}</td>
                        <td style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => handleSendInvitation(guest.id)}
                            style={{ ...smallButtonStyle, opacity: sending === guest.id ? 0.6 : 1 }}
                            disabled={sending === guest.id}
                          >
                            {sending === guest.id ? 'Enviando…' : 'Enviar correo'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGenerateWhatsapp(guest.id)}
                            style={smallButtonSecondary}
                          >
                            WhatsApp
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section style={{ ...cardStyle, marginTop: spacing.lg }}>
              <h2 style={sectionHeading}>Importar invitados (CSV)</h2>
              <p style={helperTextStyle}>
                Formato esperado: nombre,email,telefono. Validamos automáticamente que el teléfono tenga 10 dígitos.
              </p>
              <textarea
                style={{ ...inputStyle, minHeight: '140px' }}
                value={csvValue}
                onChange={(event) => setCsvValue(event.target.value)}
                aria-label="Contenido CSV"
              />
              <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                <button type="button" style={secondaryButton} onClick={handleImportCsv}>
                  Importar CSV
                </button>
                <button type="button" style={ghostButton} onClick={() => setCsvValue('')}>
                  Limpiar
                </button>
              </div>
              {importFeedback && <p style={helperTextStyle}>{importFeedback}</p>}
              </section>
            </TabPanel>
            <TabPanel value="live">
              <StageMetrics stage="during" pending={pending.length} confirmed={confirmed.length} scanned={scanned.length} />
              <section style={{ ...cardStyle, marginTop: spacing.lg }}>
                <h2 style={sectionHeading}>Escaneados en tiempo real</h2>
                <p style={helperTextStyle}>Actualizamos esta lista cada 10 segundos.</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th scope="col">Nombre</th>
                        <th scope="col">Teléfono</th>
                        <th scope="col">Escaneado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scannedGuests.length === 0 && (
                        <tr>
                          <td colSpan={3} style={emptyCellStyle}>
                            Aún no hay invitados escaneados.
                          </td>
                        </tr>
                      )}
                      {scannedGuests.map((guest) => (
                        <tr key={guest.id}>
                          <td>{guest.name}</td>
                          <td>{formatPhone(guest.phone)}</td>
                          <td>{guest.scannedAt ? new Date(guest.scannedAt).toLocaleTimeString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
};

const sectionHeading: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  marginBottom: spacing.sm,
};

const helperTextStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: typography.body,
};

const emptyCellStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: spacing.md,
  fontFamily: typography.body,
};

const smallButtonStyle: React.CSSProperties = {
  ...parseStyles(buttonStyles.primary),
  padding: `${spacing.xs} ${spacing.sm}`,
  fontSize: '0.9rem',
};

const smallButtonSecondary: React.CSSProperties = {
  ...parseStyles(buttonStyles.secondary),
  padding: `${spacing.xs} ${spacing.sm}`,
  fontSize: '0.9rem',
};

const alertStyle: React.CSSProperties = {
  marginBottom: spacing.lg,
  padding: spacing.md,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.1)',
  color: colors.danger,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: typography.body,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: colors.lightGray,
  margin: 0,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing.sm,
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: spacing.sm,
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

const secondaryLinkStyle: React.CSSProperties = {
  ...parseStyles(buttonStyles.ghost),
  textDecoration: 'none',
  alignSelf: 'start',
};

function statusLabel(status: ConfirmationState) {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'confirmed':
      return 'Confirmado';
    case 'scanned':
      return 'Escaneado';
    default:
      return status;
  }
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

