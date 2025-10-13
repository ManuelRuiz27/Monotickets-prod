'use client';

import Link from 'next/link';
import { useMemo, type CSSProperties } from 'react';

const SAMPLE_CODES = [
  { code: 'demo-confirmed', label: 'Invitación confirmada', target: '/invite/demo-confirmed' },
  { code: 'demo-pending', label: 'Invitación pendiente', target: '/invite/demo-pending' },
  { code: 'demo-scanned', label: 'Invitación ya escaneada', target: '/invite/demo-scanned' },
];

export default function LandingPage() {
  const today = useMemo(() => new Date().toLocaleDateString('es-MX', { dateStyle: 'full' }), []);

  return (
    <div style={surfaceStyle}>
      <header style={heroStyle}>
        <p style={eyebrowStyle}>Experiencia de invitado</p>
        <h1 style={titleStyle}>Consulta tu invitación en segundos</h1>
        <p style={leadStyle}>
          Esta versión de prueba demuestra cómo navega un invitado entre portada, detalles y código QR. Usa los códigos
          de muestra para explorar los distintos estados.
        </p>
        <div style={ctaGroupStyle}>
          <Link href="/info" style={primaryCtaStyle}>
            Ver recorrido guiado
          </Link>
          <Link href="/invite/demo-confirmed" style={secondaryCtaStyle}>
            Abrir invitación demo
          </Link>
        </div>
      </header>

      <section aria-label="Prueba rápida" style={cardStyle}>
        <h2 style={cardTitleStyle}>Prueba rápida</h2>
        <p style={cardIntroStyle}>Selecciona un estado para ver la experiencia correspondiente.</p>
        <ul style={codeListStyle}>
          {SAMPLE_CODES.map((item) => (
            <li key={item.code} style={codeItemStyle}>
              <Link href={item.target} style={codeLinkStyle}>
                <span style={codeBadgeStyle}>{item.code}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p style={helperTextStyle}>
          Tip: navega con el teclado usando <kbd>Tab</kbd> y <kbd>Enter</kbd>. Toda la interfaz cumple con contraste AA.
        </p>
      </section>

      <section aria-label="¿Qué incluye?" style={cardStyle}>
        <h2 style={cardTitleStyle}>¿Qué puedes revisar hoy?</h2>
        <ul style={featureGridStyle}>
          <li>
            <strong>Portada visual</strong>
            <p style={featureTextStyle}>
              Imagen hero, saludo personalizado y CTA para ver detalles adicionales.
            </p>
          </li>
          <li>
            <strong>Detalles del evento</strong>
            <p style={featureTextStyle}>
              Lugar, agenda, enlaces asociados y un acceso directo al código QR.
            </p>
          </li>
          <li>
            <strong>Pantalla de QR</strong>
            <p style={featureTextStyle}>
              Diferencia entre estados confirmados y pendientes. El QR se oculta cuando el invitado aún no confirma.
            </p>
          </li>
        </ul>
      </section>

      <footer style={footerStyle}>
        <small style={{ opacity: 0.8 }}>
          Datos generados localmente · {today}. No se realiza ninguna llamada a servicios externos en este modo demo.
        </small>
      </footer>
    </div>
  );
}

const surfaceStyle: CSSProperties = {
  minHeight: '100vh',
  padding: 'clamp(32px, 5vw, 64px) clamp(16px, 5vw, 48px)',
  display: 'grid',
  gap: 'clamp(24px, 4vw, 36px)',
};

const heroStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  borderRadius: '24px',
  padding: 'clamp(24px, 6vw, 40px)',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)',
  display: 'grid',
  gap: '16px',
  maxWidth: '960px',
  margin: '0 auto',
};

const eyebrowStyle: CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  fontSize: '0.85rem',
  color: 'var(--guest-color-secondary)',
  margin: 0,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(2.4rem, 5vw, 3.4rem)',
  fontFamily: 'var(--guest-font-heading)',
};

const leadStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.15rem',
  lineHeight: 1.7,
};

const ctaGroupStyle: CSSProperties = {
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
};

const primaryCtaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '14px 28px',
  borderRadius: '999px',
  background: 'linear-gradient(135deg, var(--guest-color-primary), #4338ca)',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 600,
};

const secondaryCtaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '14px 28px',
  borderRadius: '999px',
  border: '1px solid var(--guest-color-primary)',
  color: 'var(--guest-color-primary)',
  textDecoration: 'none',
  fontWeight: 600,
  background: '#fff',
};

const cardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  borderRadius: '20px',
  padding: 'clamp(20px, 4vw, 32px)',
  boxShadow: '0 16px 35px rgba(15, 23, 42, 0.12)',
  display: 'grid',
  gap: '16px',
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--guest-font-heading)',
};

const cardIntroStyle: CSSProperties = {
  margin: 0,
  color: 'rgba(15,23,42,0.75)',
};

const codeListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: '12px',
};

const codeItemStyle: CSSProperties = {
  borderRadius: '14px',
  border: '1px solid rgba(15,23,42,0.08)',
  background: 'rgba(15,23,42,0.04)',
};

const codeLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  color: 'inherit',
  textDecoration: 'none',
  fontWeight: 600,
  gap: '12px',
};

const codeBadgeStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '999px',
  background: 'rgba(37,99,235,0.18)',
  color: 'var(--guest-color_primary)',
  fontFamily: 'var(--guest-font-heading)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
};

const helperTextStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.9rem',
  color: 'rgba(15,23,42,0.7)',
};

const featureGridStyle: CSSProperties = {
  display: 'grid',
  gap: '18px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const featureTextStyle: CSSProperties = {
  margin: '8px 0 0',
  color: 'rgba(15,23,42,0.7)',
  lineHeight: 1.5,
};

const footerStyle: CSSProperties = {
  textAlign: 'center',
  marginTop: '16px',
  fontSize: '0.9rem',
};
