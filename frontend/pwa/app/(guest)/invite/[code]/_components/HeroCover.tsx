import type React from 'react';
import Link from 'next/link';
import type { EventSummary, GuestSummary } from '../../../../lib/api/guest';
import { withThemeClassName } from '../../../../lib/theme/overrides';

interface HeroCoverProps {
  event: EventSummary;
  guest: GuestSummary;
  detailsHref: string;
}

export function HeroCover({ event, guest, detailsHref }: HeroCoverProps) {
  return (
    <section
      aria-labelledby="invite-hero-title"
      className={withThemeClassName('invite-hero')}
      style={heroStyle}
    >
      <div style={overlayStyle}>
        <header>
          <p style={eyebrowStyle}>Invitación para</p>
          <h1 id="invite-hero-title" style={titleStyle}>
            {event.title}
          </h1>
          {event.subtitle && (
            <p style={subtitleStyle} aria-describedby="invite-hero-title">
              {event.subtitle}
            </p>
          )}
        </header>
        <div style={guestCardStyle}>
          <p style={guestGreetingStyle}>Hola {guest.name},</p>
          <p style={guestMessageStyle}>
            Estás invitado a este evento. Revisa los detalles completos y confirma tu asistencia.
          </p>
          <Link href={detailsHref} prefetch={false} style={ctaStyle}>
            Ver detalles
          </Link>
        </div>
      </div>
      {event.coverImageUrl && (
        <img
          src={event.coverImageUrl}
          alt={event.coverAlt ?? `Portada del evento ${event.title}`}
          style={imageStyle}
        />
      )}
    </section>
  );
}

const heroStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  minHeight: '100vh',
  padding: 'min(8vw, 96px)',
  backgroundColor: 'var(--guest-color-background)',
  color: 'var(--guest-color-text)',
};

const overlayStyle: React.CSSProperties = {
  zIndex: 2,
  maxWidth: '640px',
  display: 'grid',
  gap: '24px',
  alignContent: 'center',
};

const imageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  opacity: 0.36,
  zIndex: 1,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--guest-color-secondary)',
  fontSize: '0.85rem',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-heading)',
  fontSize: 'clamp(2rem, 3vw + 1.2rem, 3.5rem)',
  margin: 0,
  color: 'var(--guest-color-text)',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  fontSize: '1.125rem',
  margin: 0,
  color: 'rgba(0,0,0,0.7)',
};

const guestCardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.88)',
  borderRadius: '16px',
  padding: '24px',
  boxShadow: '0 12px 32px rgba(13, 27, 42, 0.15)',
  backdropFilter: 'blur(12px)',
  color: '#0D1B2A',
};

const guestGreetingStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-heading)',
  fontSize: '1.125rem',
  marginBottom: '8px',
};

const guestMessageStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  fontSize: '1rem',
  lineHeight: 1.6,
  marginBottom: '16px',
};

const ctaStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: 'var(--guest-color-primary)',
  color: '#fff',
  borderRadius: '999px',
  padding: '12px 24px',
  fontFamily: 'var(--guest-font-heading)',
  fontWeight: 600,
  textDecoration: 'none',
  textAlign: 'center',
  minWidth: '180px',
};
