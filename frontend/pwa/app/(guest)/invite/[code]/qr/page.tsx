import type React from 'react';
import { notFound } from 'next/navigation';
import { getInvite, getInviteQr } from '@/lib/api/guest';
import { themeToStyle } from '@/lib/theme/overrides';

interface PageProps {
  params: { code: string };
}

export default async function InviteQrPage({ params }: PageProps) {
  const { code } = params;
  const invite = await getInvite(code).catch(() => null);

  if (!invite) {
    notFound();
  }

  const qrResponse = await getInviteQr(code).catch(() => ({
    status: invite.guest.status,
    qr: invite.qr,
  }));

  const status = qrResponse.status ?? invite.guest.status;
  const qr = qrResponse.qr ?? invite.qr;
  const isActive = status === 'confirmed' || status === 'scanned';

  return (
    <div style={{ ...surfaceBase, ...themeToStyle(invite.theme) }}>
      <main style={wrapperStyle} aria-labelledby="qr-heading">
        <header>
          <p style={eyebrowStyle}>Acceso al evento</p>
          <h1 id="qr-heading" style={titleStyle}>
            Tu código QR
          </h1>
        </header>
        {!isActive && (
          <div style={placeholderStyle} role="status" aria-live="polite">
            <p style={placeholderTextStyle}>El QR se activa al confirmar tu asistencia.</p>
            <p style={secondaryTextStyle}>
              Confirma desde la sección de detalles para habilitar tu acceso. Recibirás confirmación al instante.
            </p>
          </div>
        )}
        {isActive && qr?.imageUrl && (
          <figure style={qrCardStyle}>
            <img src={qr.imageUrl} alt={qr.altText} style={qrImageStyle} />
            <figcaption style={secondaryTextStyle}>
              Presenta este código en el acceso. No es necesario que recargues esta pantalla.
            </figcaption>
          </figure>
        )}
        {isActive && !qr?.imageUrl && (
          <p style={secondaryTextStyle}>
            Tu QR está activo, pero no pudimos cargar la imagen. Usa el enlace del correo de confirmación o contacta al
            organizador.
          </p>
        )}
        <a href="../details" style={backLinkStyle}>
          Regresar a los detalles del evento
        </a>
      </main>
    </div>
  );
}

const surfaceBase: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '32px 16px',
  fontFamily: 'var(--guest-font-body)',
  color: 'var(--guest-color-text)',
  backgroundColor: 'var(--guest-color-background)',
};

const wrapperStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.9)',
  borderRadius: '24px',
  padding: '32px',
  boxShadow: '0 16px 32px rgba(13,27,42,0.18)',
  display: 'grid',
  gap: '24px',
  width: 'min(480px, 90vw)',
  textAlign: 'center',
};

const eyebrowStyle: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontFamily: 'var(--guest-font-body)',
  fontSize: '0.85rem',
  color: 'var(--guest-color-secondary)',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-heading)',
  fontSize: '2rem',
  margin: 0,
};

const placeholderStyle: React.CSSProperties = {
  border: '2px dashed rgba(13,27,42,0.25)',
  borderRadius: '16px',
  padding: '32px 16px',
  display: 'grid',
  gap: '12px',
};

const placeholderTextStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-heading)',
  fontSize: '1.25rem',
  margin: 0,
};

const secondaryTextStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  color: 'rgba(13,27,42,0.7)',
  margin: 0,
  lineHeight: 1.5,
};

const qrCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  justifyItems: 'center',
};

const qrImageStyle: React.CSSProperties = {
  width: '260px',
  height: '260px',
  objectFit: 'contain',
  background: '#fff',
  padding: '12px',
  borderRadius: '16px',
  border: '1px solid rgba(13,27,42,0.1)',
};

const backLinkStyle: React.CSSProperties = {
  fontFamily: 'var(--guest-font-body)',
  color: 'var(--guest-color-primary)',
  textDecoration: 'underline',
};
