'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

export default function QuickQrGuidePage() {
  return (
    <div style={wrapperStyle}>
      <main style={cardStyle}>
        <header style={{ display: 'grid', gap: 8 }}>
          <p style={eyebrowStyle}>Guía rápida</p>
          <h1 style={titleStyle}>Pantalla de QR en modo demostración</h1>
        </header>

        <section aria-live="polite">
          <p style={paragraphStyle}>
            Para ver un QR activo visita{' '}
            <Link href="/invite/demo-confirmed/qr" style={linkStyle}>
              demo-confirmed/qr
            </Link>
            . Si quieres comprobar el mensaje de bloqueo, abre{' '}
            <Link href="/invite/demo-pending/qr" style={linkStyle}>
              demo-pending/qr
            </Link>
            .
          </p>
          <p style={paragraphStyle}>
            Esta vista no genera códigos reales. Las imágenes provienen de un recurso embebido en base64 y recrean el
            layout final sin depender de servicios externos.
          </p>
        </section>

        <footer style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/" style={linkButtonStyle}>
            Volver a la portada
          </Link>
          <Link href="/invite/demo-confirmed" style={primaryButtonStyle}>
            Abrir invitación confirmada
          </Link>
        </footer>
      </main>
    </div>
  );
}

const wrapperStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 'clamp(24px, 6vw, 48px)',
};

const cardStyle: CSSProperties = {
  width: 'min(720px, 95vw)',
  background: 'rgba(255,255,255,0.95)',
  borderRadius: '24px',
  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.16)',
  padding: 'clamp(24px, 5vw, 40px)',
  display: 'grid',
  gap: '18px',
};

const eyebrowStyle: CSSProperties = {
  textTransform: 'uppercase',
  fontSize: '0.8rem',
  letterSpacing: '0.12em',
  color: 'var(--guest-color-secondary)',
  margin: 0,
};

const titleStyle: CSSProperties = {
  fontFamily: 'var(--guest-font-heading)',
  margin: 0,
  fontSize: 'clamp(2rem, 4vw, 2.6rem)',
};

const paragraphStyle: CSSProperties = {
  margin: '0 0 12px',
  lineHeight: 1.6,
  color: 'rgba(15,23,42,0.75)',
};

const linkStyle: CSSProperties = {
  color: 'var(--guest-color-primary)',
  fontWeight: 600,
};

const linkButtonStyle: CSSProperties = {
  padding: '12px 24px',
  borderRadius: '999px',
  textDecoration: 'none',
  border: '1px solid rgba(15,23,42,0.18)',
  color: 'var(--guest-color-primary)',
  background: '#fff',
  fontWeight: 600,
};

const primaryButtonStyle: CSSProperties = {
  padding: '12px 24px',
  borderRadius: '999px',
  textDecoration: 'none',
  background: 'linear-gradient(135deg, var(--guest-color-primary), #4338ca)',
  color: '#fff',
  fontWeight: 600,
};
