import type React from 'react';

export default function InviteLoading() {
  return (
    <div role="status" style={containerStyle}>
      <p style={textStyle}>Cargando tu invitación…</p>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#F6F9FC',
};

const textStyle: React.CSSProperties = {
  fontFamily: `'Inter', 'Roboto', system-ui, sans-serif`,
  fontSize: '1.125rem',
  color: '#0D1B2A',
};
