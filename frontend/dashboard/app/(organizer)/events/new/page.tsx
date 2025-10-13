'use client';

import React from 'react';
import {
  createEvent,
  addGuest,
  generateWhatsappLink,
  sendBulkWhatsapp,
  invalidateCaches,
  CreateEventPayload,
  Guest,
} from '@/lib/api/organizer';
import { StepCover, CoverData } from './_components/StepCover';
import { StepGuests, GuestDraft } from './_components/StepGuests';
import { StepWhatsApp } from './_components/StepWhatsApp';
import { colors, spacing, typography, cardStyles, buttonStyles, parseStyles } from '@shared/theme';

const steps = ['Portada y landing', 'Invitados', 'WhatsApp'] as const;

type Step = (typeof steps)[number];

const cardStyle = parseStyles(cardStyles);
const primaryButton = parseStyles(buttonStyles.primary);
const secondaryButton = parseStyles(buttonStyles.secondary);

export default function NewEventPage() {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [coverData, setCoverData] = React.useState<CoverData>({
    name: '',
    description: '',
    location: '',
    startDate: '',
    endDate: '',
    type: 'standard',
    coverUrl: '',
    pdfUrl: '',
    flipbookUrl: '',
    landingUrl: '',
    landingTtlDays: 7,
  });
  const [guestDrafts, setGuestDrafts] = React.useState<GuestDraft[]>([]);
  const [createdEventId, setCreatedEventId] = React.useState<string | null>(null);
  const [createdGuests, setCreatedGuests] = React.useState<Guest[]>([]);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const currentStep = steps[stepIndex];

  const goPrevious = () => {
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const handleNext = async () => {
    if (stepIndex === 0) {
      setStepIndex(1);
      return;
    }
    if (stepIndex === 1) {
      if (createdEventId) {
        setStepIndex(2);
        return;
      }
      const hasErrors = guestDrafts.some((guest) => guest.error);
      if (hasErrors) {
        setStatusMessage('Corrige los invitados marcados en rojo antes de continuar.');
        return;
      }
      setLoading(true);
      try {
        const payload: CreateEventPayload = {
          name: coverData.name,
          description: coverData.description,
          location: coverData.location,
          startsAt: coverData.startDate,
          endsAt: coverData.endDate || undefined,
          type: coverData.type,
          coverUrl: coverData.coverUrl || undefined,
          pdfUrl: coverData.pdfUrl || undefined,
          flipbookUrl: coverData.flipbookUrl || undefined,
          landingUrl: coverData.landingUrl || undefined,
          landingTtlDays: coverData.landingTtlDays,
        };
        const created = await createEvent(payload);
        const addedGuests = await Promise.all(
          guestDrafts.map((guest) =>
            addGuest(created.id, {
              name: guest.name,
              email: guest.email,
              phone: guest.phone,
            })
          )
        );
        setCreatedEventId(created.id);
        setCreatedGuests(addedGuests);
        setStatusMessage('Evento guardado. Genera tus enlaces de WhatsApp a continuación.');
        setStepIndex(2);
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? `No pudimos crear el evento: ${error.message}` : 'Ocurrió un error inesperado'
        );
      } finally {
        setLoading(false);
      }
      return;
    }
  };

  const handleFinish = async () => {
    if (!createdEventId) {
      setStatusMessage('Crea el evento antes de finalizar.');
      return;
    }
    try {
      await invalidateCaches(createdEventId);
      setStatusMessage('¡Listo! El evento quedó configurado y las vistas fueron actualizadas.');
      setStepIndex(0);
      setCoverData({
        name: '',
        description: '',
        location: '',
        startDate: '',
        endDate: '',
        type: 'standard',
        coverUrl: '',
        pdfUrl: '',
        flipbookUrl: '',
        landingUrl: '',
        landingTtlDays: 7,
      });
      setGuestDrafts([]);
      setCreatedEventId(null);
      setCreatedGuests([]);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? `No se pudo limpiar la caché: ${error.message}` : 'Error desconocido al finalizar'
      );
    }
  };

  const handleGenerateLink = React.useCallback(
    async (guestId?: string) => {
      if (!createdEventId) return null;
      return generateWhatsappLink(createdEventId, guestId);
    },
    [createdEventId]
  );

  const handleSendWhatsapp = React.useCallback(async () => {
    if (!createdEventId) return null;
    return sendBulkWhatsapp(createdEventId);
  }, [createdEventId]);

  return (
    <main aria-labelledby="new-event-title" style={{ padding: spacing.xl }}>
      <h1 id="new-event-title" style={titleStyle}>
        Nuevo evento
      </h1>
      <p style={subtitleStyle}>
        Configura la landing pública, agrega invitados y prepara la campaña de WhatsApp en tres pasos.
      </p>
      <nav aria-label="Progreso del wizard" style={{ marginBottom: spacing.lg }}>
        <ol style={stepListStyle}>
          {steps.map((step, index) => (
            <li
              key={step}
              aria-current={index === stepIndex ? 'step' : undefined}
              style={{
                ...stepItemStyle,
                borderColor: index === stepIndex ? colors.sky : 'transparent',
                color: index === stepIndex ? colors.navy : colors.lightGray,
              }}
            >
              <span style={stepNumberStyle}>{index + 1}</span> {step}
            </li>
          ))}
        </ol>
      </nav>
      <section style={cardStyle}>
        {currentStep === 'Portada y landing' && <StepCover value={coverData} onChange={setCoverData} />}
        {currentStep === 'Invitados' && <StepGuests guests={guestDrafts} onGuestsChange={setGuestDrafts} />}
        {currentStep === 'WhatsApp' && (
          <StepWhatsApp
            eventId={createdEventId}
            guests={createdGuests}
            onGenerateLink={handleGenerateLink}
            onSendBulk={handleSendWhatsapp}
          />
        )}
      </section>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: spacing.lg }}>
        <button type="button" onClick={goPrevious} disabled={stepIndex === 0} style={secondaryButton}>
          Anterior
        </button>
        {stepIndex < steps.length - 1 ? (
          <button type="button" onClick={handleNext} style={primaryButton} disabled={loading}>
            {loading ? 'Guardando…' : 'Siguiente'}
          </button>
        ) : (
          <button type="button" onClick={handleFinish} style={primaryButton}>
            Finalizar
          </button>
        )}
      </div>
      {statusMessage && (
        <p role="status" style={{ marginTop: spacing.lg, fontFamily: typography.body, color: colors.navy }}>
          {statusMessage}
        </p>
      )}
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  marginBottom: spacing.lg,
};

const stepListStyle: React.CSSProperties = {
  display: 'flex',
  gap: spacing.md,
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const stepItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  fontFamily: typography.subtitle,
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: '12px',
  border: `2px solid transparent`,
};

const stepNumberStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '999px',
  background: colors.sky,
  color: colors.white,
  display: 'grid',
  placeItems: 'center',
  fontSize: '0.9rem',
};
