'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  EventSummary,
  GuestSummary,
  GuestStatus,
  InviteTemplateKind,
  TemplateLinks,
} from '@/lib/api/guest';
import { confirmAttendance } from '@/lib/api/guest';
import { withThemeClassName } from '@/lib/theme/overrides';
import { CalendarCTA } from './CalendarCTA';

interface EventInfoProps {
  code: string;
  event: EventSummary;
  guest: GuestSummary;
  template: InviteTemplateKind;
  templateLinks?: TemplateLinks;
  qrHref: string;
}

export function EventInfo({ code, event, guest, template, templateLinks, qrHref }: EventInfoProps) {
  const pdfUrl = templateLinks?.pdfUrl;
  const flipbookUrl = templateLinks?.flipbookUrl;
  const thumbnailUrl = templateLinks?.thumbnailUrl;
  const router = useRouter();
  const [status, setStatus] = React.useState<GuestStatus>(guest.status);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStatus(guest.status);
  }, [guest.status, code]);

  const handleConfirm = async () => {
    if (status !== 'pending') {
      return;
    }
    setIsConfirming(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await confirmAttendance(code);
      const nextStatus = response.status ?? 'confirmed';
      setStatus(nextStatus);
      setFeedback('¡Listo! Tu asistencia fue confirmada. Te llevamos a tu código QR.');
      router.push(response.redirectUrl ?? qrHref);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'No pudimos confirmar tu asistencia. Intenta nuevamente en unos minutos.';
      setError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <main className={withThemeClassName('invite-details')} style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Detalles del evento</p>
          <h1 style={titleStyle}>{event.title}</h1>
          {event.subtitle && <p style={subtitleStyle}>{event.subtitle}</p>}
        </div>
        <div style={metaListStyle}>
          <p><strong>Fecha:</strong> {formatDateRange(event.startDate, event.endDate, event.timezone)}</p>
          {event.location && (
            <p>
              <strong>Ubicación:</strong> {event.location}
            </p>
          )}
        </div>
      </header>
      {event.description && (
        <section aria-label="Descripción del evento" style={sectionStyle}>
          <p style={descriptionStyle}>{event.description}</p>
        </section>
      )}
      <CalendarCTA
        eventTitle={event.title}
        startDate={event.startDate}
        endDate={event.endDate ?? undefined}
        timezone={event.timezone ?? undefined}
        location={event.location}
        description={event.calendarDescription ?? event.description}
      />
      <section style={sectionStyle} aria-labelledby="event-template-heading">
        <h2 id="event-template-heading" style={headingStyle}>
          Invitación {template === 'premium' ? 'Premium (flipbook)' : 'Estándar (PDF)'}
        </h2>
        {template === 'standard' && pdfUrl && (
          <div style={pdfContainerStyle}>
            <object
              data={pdfUrl}
              aria-label={`Vista previa PDF del evento ${event.title}`}
              type="application/pdf"
              style={pdfObjectStyle}
            >
              <p>
                Tu navegador no puede mostrar el PDF. Puedes descargarlo{' '}
                <a href={pdfUrl} target="_blank" rel="noreferrer">
                  en este enlace
                </a>
                .
              </p>
            </object>
          </div>
        )}
        {template === 'standard' && !pdfUrl && (
          <p style={helperTextStyle}>
            Aún no hay un PDF asociado. Contacta al organizador para obtenerlo.
          </p>
        )}
        {template === 'premium' && flipbookUrl && (
          <FlipbookEmbed flipbookUrl={flipbookUrl} thumbnailUrl={thumbnailUrl} title={event.title} />
        )}
        {template === 'premium' && !flipbookUrl && (
          <p style={helperTextStyle}>
            El flipbook no está disponible por el momento. Intenta más tarde o revisa la versión PDF.
          </p>
        )}
      </section>
      <section style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={helperTextStyle}>
          {status === 'pending'
            ? 'Confirma tu asistencia para activar tu acceso digital. El código QR se mostrará automáticamente.'
            : 'Gracias por confirmar. Puedes acceder al QR cuando lo necesites.'}
        </p>
        <button
          type="button"
          onClick={handleConfirm}
          style={{
            ...confirmButtonStyle,
            opacity: isConfirming ? 0.75 : 1,
            cursor: isConfirming ? 'wait' : status === 'pending' ? 'pointer' : 'not-allowed',
          }}
          aria-disabled={status !== 'pending'}
          disabled={isConfirming || status !== 'pending'}
        >
          {status === 'pending' ? 'Confirmar asistencia' : 'Asistencia confirmada'}
        </button>
        <Link
          href={qrHref}
          prefetch={false}
          style={{
            ...secondaryButtonStyle,
            opacity: status === 'pending' ? 0.65 : 1,
            pointerEvents: status === 'pending' ? 'none' : 'auto',
            cursor: status === 'pending' ? 'not-allowed' : 'pointer',
          }}
          aria-disabled={status === 'pending'}
          tabIndex={status === 'pending' ? -1 : undefined}
        >
          Ver QR de acceso
        </Link>
        <div aria-live="polite" style={visuallyHidden}>
          {feedback}
        </div>
        {feedback && (
          <p style={successTextStyle}>{feedback}</p>
        )}
        {error && (
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

interface FlipbookEmbedProps {
  flipbookUrl: string;
  thumbnailUrl?: string;
  title: string;
}

function FlipbookEmbed({ flipbookUrl, thumbnailUrl, title }: FlipbookEmbedProps) {
  return (
    <div style={flipbookWrapperStyle}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (prefers-reduced-motion: reduce) {
              .flipbook-frame {
                transition: none !important;
              }
            }
          `,
        }}
      />
      <iframe
        src={flipbookUrl}
        title={`Flipbook interactivo del evento ${title}`}
        className="flipbook-frame"
        style={flipbookFrameStyle}
        allowFullScreen
      />
      {thumbnailUrl && (
        <p style={helperTextStyle}>
          Si prefieres una versión estática, descarga la portada{' '}
          <a href={thumbnailUrl} target="_blank" rel="noreferrer">
            aquí
          </a>
          .
        </p>
      )}
    </div>
  );
}

function formatDateRange(start: string, end?: string | null, timezone?: string | null) {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'full',
    timeStyle: 'short',
  };
  if (timezone) {
    options.timeZone = timezone;
  }
  const startFormatted = new Intl.DateTimeFormat('es-MX', options).format(startDate);
  if (!endDate) {
    return startFormatted;
  }
  const endFormatted = new Intl.DateTimeFormat('es-MX', options).format(endDate);
  return `${startFormatted} – ${endFormatted}`;
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: 'var(--guest-color-background)',
  color: 'var(--guest-color-text)',
  padding: '32px',
  display: 'grid',
  gap: '32px',
  maxWidth: '960px',
  margin: '0 auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '16px',
  borderBottom: '1px solid rgba(13, 27, 42, 0.1)',
  paddingBottom: '16px',
};

const eyebrowStyle: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontSize: '0.8rem',
  fontFamily: 'var(--guest-font-body)',
  color: 'var(--guest-color-secondary)',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-heading)',
  fontSize: '2.25rem',
  margin: '8px 0',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  fontSize: '1.1rem',
  margin: 0,
};

const metaListStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  display: 'grid',
  gap: '4px',
  color: 'var(--guest-color-text)',
};

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: '16px',
};

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-heading)',
  fontSize: '1.5rem',
  margin: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  lineHeight: 1.7,
  fontSize: '1.05rem',
};

const helperTextStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  fontSize: '0.95rem',
  color: 'rgba(13,27,42,0.65)',
};

const errorTextStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  fontSize: '0.95rem',
  color: '#b91c1c',
  margin: 0,
};

const successTextStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  fontSize: '0.95rem',
  color: 'var(--guest-color-primary)',
  margin: 0,
};

const pdfContainerStyle: React.CSSProperties = {
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 12px 40px rgba(13, 27, 42, 0.12)',
  minHeight: '480px',
};

const pdfObjectStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: '480px',
  border: 'none',
};

const flipbookWrapperStyle: React.CSSProperties = {
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 12px 40px rgba(13, 27, 42, 0.12)',
  backgroundColor: '#000',
};

const flipbookFrameStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '520px',
  border: 'none',
};

const confirmButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--guest-color-primary)',
  color: '#fff',
  borderRadius: '12px',
  padding: '16px',
  textAlign: 'center',
  fontFamily: 'var(--guest-font-heading)',
  fontWeight: 600,
  textDecoration: 'none',
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '2px solid var(--guest-color-primary)',
  color: 'var(--guest-color-primary)',
  borderRadius: '12px',
  padding: '14px',
  textAlign: 'center',
  fontFamily: 'var(--guest-font-heading)',
  fontWeight: 600,
  textDecoration: 'none',
};

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  border: 0,
};
