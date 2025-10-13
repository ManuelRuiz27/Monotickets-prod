import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Monotickets · Panel organizadores',
  description: 'Dashboard demostrativo con datos seed para organizadores y directores.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Panel Monotickets</p>
            <h1 style={titleStyle}>Operación de eventos</h1>
          </div>
          <nav aria-label="Secciones principales" style={navStyle}>
            <Link href="/director" style={navLinkStyle}>
              Director
            </Link>
            <Link href="/organizer" style={navLinkStyle}>
              Organizador
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '16px',
  padding: 'clamp(16px, 4vw, 32px)',
  width: 'min(1100px, 95vw)',
  margin: '0 auto',
};

const eyebrowStyle: CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontSize: '0.8rem',
  margin: 0,
  color: 'rgba(15, 23, 42, 0.6)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
  fontFamily: 'var(--font-title)',
};

const navStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
};

const navLinkStyle: CSSProperties = {
  textDecoration: 'none',
  padding: '10px 18px',
  borderRadius: '999px',
  background: 'rgba(37, 99, 235, 0.12)',
  color: 'var(--color-sky)',
  fontWeight: 600,
};
