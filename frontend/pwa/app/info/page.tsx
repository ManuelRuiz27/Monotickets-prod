'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

const listStyle: CSSProperties = {
  display: 'grid',
  gap: '12px',
  paddingLeft: '1.2rem',
  lineHeight: 1.6,
};

const containerStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.95)',
  borderRadius: '20px',
  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.14)',
  padding: 'clamp(20px, 4vw, 36px)',
  display: 'grid',
  gap: '18px',
};

export default function InfoPage() {
  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(24px, 6vw, 48px) clamp(16px, 5vw, 48px)' }}>
      <main style={containerStyle}>
        <header>
          <p style={{ textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.12em' }}>Recorrido guiado</p>
          <h1 style={{ margin: 0, fontFamily: 'var(--guest-font-heading)', fontSize: 'clamp(2rem, 4vw, 2.8rem)' }}>
            ¿Cómo funciona la invitación?
          </h1>
          <p style={{ margin: '12px 0 0', color: 'rgba(15,23,42,0.7)' }}>
            Todo el flujo está generado con datos de muestra. Explora cada paso con teclado o lector de pantalla.
          </p>
        </header>

        <section>
          <h2 style={{ marginBottom: 8 }}>Pasos sugeridos</h2>
          <ol style={listStyle}>
            <li>
              Abre la invitación confirmada:{' '}
              <Link href="/invite/demo-confirmed" style={{ color: 'var(--guest-color-primary)' }}>
                demo-confirmed
              </Link>{' '}
              para ver la portada y CTA.
            </li>
            <li>
              Desde la portada, ve a “Ver detalles”. Encontrarás enlaces a PDF y un CTA hacia el código QR.
            </li>
            <li>
              Abre la pestaña de QR. Si el invitado está confirmado, verás el código. Si pruebas{' '}
              <Link href="/invite/demo-pending" style={{ color: 'var(--guest-color-primary)' }}>
                demo-pending
              </Link>
              , el QR mostrará un mensaje indicando que falta confirmar.
            </li>
            <li>
              Repite con{' '}
              <Link href="/invite/demo-scanned" style={{ color: 'var(--guest-color-primary)' }}>
                demo-scanned
              </Link>{' '}
              para ver el estado utilizado.
            </li>
          </ol>
        </section>

        <section>
          <h2 style={{ marginBottom: 8 }}>Accesibilidad básica</h2>
          <ul style={listStyle}>
            <li>Todas las secciones definen encabezados semánticos y aria-live donde aplica.</li>
            <li>Los textos mantienen un contraste mínimo de 4.5:1 respecto al fondo.</li>
            <li>Se respeta la preferencia de usuarios que reducen animaciones.</li>
          </ul>
        </section>

        <footer style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/" style={backLinkStyle}>
            Volver al inicio
          </Link>
          <Link href="/invite/demo-confirmed/qr" style={primaryLinkStyle}>
            Ir directamente al QR de demostración
          </Link>
        </footer>
      </main>
    </div>
  );
}

const backLinkStyle: CSSProperties = {
  padding: '12px 20px',
  borderRadius: '999px',
  background: '#fff',
  border: '1px solid rgba(15,23,42,0.12)',
  color: 'var(--guest-color-primary)',
  textDecoration: 'none',
  fontWeight: 600,
};

const primaryLinkStyle: CSSProperties = {
  padding: '12px 20px',
  borderRadius: '999px',
  background: 'linear-gradient(135deg, var(--guest-color-primary), #4338ca)',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 600,
};
