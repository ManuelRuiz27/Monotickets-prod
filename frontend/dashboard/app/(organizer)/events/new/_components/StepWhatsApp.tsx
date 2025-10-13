'use client';

import React from 'react';
import type { Guest, WhatsappLink } from '@/lib/api/organizer';
import { colors, typography, spacing, buttonStyles } from '@shared/theme';

const primaryButton = parseStyles(buttonStyles.primary);
const secondaryButton = parseStyles(buttonStyles.secondary);
const ghostButton = parseStyles(buttonStyles.ghost);

interface StepWhatsAppProps {
  eventId: string | null;
  guests: Guest[];
  onGenerateLink: (guestId?: string) => Promise<WhatsappLink | null | undefined>;
  onSendBulk: () => Promise<{ queued: number } | null | undefined>;
}

export function StepWhatsApp({ eventId, guests, onGenerateLink, onSendBulk }: StepWhatsAppProps) {
  const [status, setStatus] = React.useState<string | null>(null);
  const [lastLink, setLastLink] = React.useState<WhatsappLink | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleGenerate = React.useCallback(
    async (guestId?: string) => {
      if (!eventId) {
        setStatus('Debes crear el evento antes de generar enlaces.');
        return;
      }
      setLoading(true);
      try {
        const link = await onGenerateLink(guestId);
        if (link) {
          setLastLink(link);
          setStatus('Enlace generado. Se abrirá en una nueva pestaña.');
          window.open(link.link, '_blank', 'noopener');
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'No se pudo generar el enlace');
      } finally {
        setLoading(false);
      }
    },
    [eventId, onGenerateLink]
  );

  const handleSendBulk = React.useCallback(async () => {
    if (!eventId) {
      setStatus('Debes crear el evento antes de enviar mensajes.');
      return;
    }
    setLoading(true);
    try {
      const result = await onSendBulk();
      if (result) {
        setStatus(`Se programaron ${result.queued} mensajes de WhatsApp.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudieron enviar los mensajes');
    } finally {
      setLoading(false);
    }
  }, [eventId, onSendBulk]);

  return (
    <section style={{ display: 'grid', gap: spacing.lg }}>
      <header>
        <h2 style={titleStyle}>Campaña de WhatsApp</h2>
        <p style={helperStyle}>
          Genera enlaces con referencia para compartir por WhatsApp. Puedes enviarlos de forma masiva o por invitado.
        </p>
      </header>
      {!eventId && (
        <p style={{ ...helperStyle, color: colors.danger }}>
          Aún no se crea el evento. Completa los pasos anteriores y regresa para generar los enlaces.
        </p>
      )}
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => handleGenerate()} style={primaryButton} disabled={!eventId || loading}>
          Generar link general
        </button>
        <button type="button" onClick={handleSendBulk} style={secondaryButton} disabled={!eventId || loading}>
          Enviar masivo
        </button>
      </div>
      {lastLink && (
        <div style={linkPreviewStyle}>
          <p style={helperStyle}>
            Último enlace generado ({lastLink.reference}):
          </p>
          <a href={lastLink.link} target="_blank" rel="noreferrer" style={linkStyle}>
            {lastLink.link}
          </a>
        </div>
      )}
      <section aria-live="polite" style={{ display: 'grid', gap: spacing.sm }}>
        <h3 style={subtitleStyle}>Invitados ({guests.length})</h3>
        {guests.length === 0 && <p style={helperStyle}>Agrega invitados en el paso anterior para personalizar envíos.</p>}
        <ul style={listStyle}>
          {guests.map((guest) => (
            <li key={guest.id} style={listItemStyle}>
              <div>
                <p style={guestNameStyle}>{guest.name}</p>
                <p style={guestMetaStyle}>{guest.email} · {formatPhone(guest.phone)}</p>
              </div>
              <button
                type="button"
                onClick={() => handleGenerate(guest.id)}
                style={ghostButton}
                disabled={!eventId || loading}
              >
                Link individual
              </button>
            </li>
          ))}
        </ul>
      </section>
      {status && (
        <p role="status" style={{ ...helperStyle, color: colors.navy }}>
          {status}
        </p>
      )}
    </section>
  );
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.5rem',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
};

const helperStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
};

const linkPreviewStyle: React.CSSProperties = {
  border: `1px solid ${colors.neutral}`,
  borderRadius: '12px',
  padding: spacing.md,
  display: 'grid',
  gap: spacing.xs,
};

const linkStyle: React.CSSProperties = {
  color: colors.sky,
  fontFamily: typography.body,
  wordBreak: 'break-all',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  display: 'grid',
  gap: spacing.sm,
  padding: 0,
  margin: 0,
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: spacing.md,
  border: `1px solid ${colors.neutral}`,
  borderRadius: '12px',
  padding: spacing.md,
};

const guestNameStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  margin: 0,
  color: colors.navy,
};

const guestMetaStyle: React.CSSProperties = {
  fontFamily: typography.body,
  margin: 0,
  color: colors.lightGray,
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
