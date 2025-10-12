'use client';

import type React from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function InviteError({ error, reset }: ErrorProps) {
  return (
    <div role="alert" style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>No pudimos cargar tu invitación</h1>
        <p style={messageStyle}>
          {error.message || 'Ocurrió un problema inesperado. Inténtalo de nuevo o contacta al organizador.'}
        </p>
        <button type="button" onClick={reset} style={buttonStyle}>
          Reintentar
        </button>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#F6F9FC',
  padding: '32px',
};

const cardStyle: React.CSSProperties = {
  maxWidth: '480px',
  background: '#fff',
  padding: '32px',
  borderRadius: '16px',
  boxShadow: '0 12px 32px rgba(13,27,42,0.12)',
  textAlign: 'center',
  display: 'grid',
  gap: '16px',
};

const titleStyle: React.CSSProperties = {
  fontFamily: `'Poppins', system-ui, sans-serif`,
  fontSize: '1.75rem',
  margin: 0,
  color: '#0D1B2A',
};

const messageStyle: React.CSSProperties = {
  fontFamily: `'Inter', 'Roboto', system-ui, sans-serif`,
  color: '#0D1B2A',
  margin: 0,
  lineHeight: 1.6,
};

const buttonStyle: React.CSSProperties = {
  alignSelf: 'center',
  padding: '12px 24px',
  borderRadius: '12px',
  background: '#4BA3FF',
  color: '#fff',
  fontFamily: `'Poppins', system-ui, sans-serif`,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
};
