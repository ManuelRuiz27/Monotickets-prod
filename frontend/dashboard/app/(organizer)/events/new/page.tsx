'use client';

import React from 'react';
import { createEvent, EventDetail, addGuest } from '../../../../lib/api/organizer';
import { StepGeneral } from './_components/StepGeneral';
import { StepBranding } from './_components/StepBranding';
import { StepGuests, GuestDraft } from './_components/StepGuests';
import { colors, spacing, typography, cardStyles } from '../../../../shared/theme';

const steps = ['General', 'Branding', 'Invitados'] as const;

type Step = (typeof steps)[number];

const cardStyle = parseStyles(cardStyles);

export default function NewEventPage() {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [eventData, setEventData] = React.useState<Partial<EventDetail>>({
    type: 'standard',
    landing_ttl_days: 7,
  });
  const [guests, setGuests] = React.useState<GuestDraft[]>([]);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const currentStep = steps[stepIndex];

  const goNext = () => setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  const goPrevious = () => setStepIndex((index) => Math.max(index - 1, 0));

  const handleSubmit = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const created = await createEvent(eventData);
      if (guests.length > 0) {
        for (const guest of guests) {
          await addGuest(created.id, { name: guest.name, email: guest.email });
        }
      }
      setStatusMessage('Evento creado correctamente. Puedes enviar invitaciones desde el panel.');
      setEventData({ type: 'standard', landing_ttl_days: 7 });
      setGuests([]);
      setStepIndex(0);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? `Ocurrió un error al crear el evento: ${error.message}` : 'Error inesperado'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main aria-labelledby="new-event-title" style={{ padding: spacing.xl }}>
      <h1 id="new-event-title" style={titleStyle}>
        Nuevo evento
      </h1>
      <nav aria-label="Progreso del wizard" style={{ marginBottom: spacing.lg }}>
        <ol style={{ display: 'flex', gap: spacing.md, listStyle: 'none', padding: 0 }}>
          {steps.map((step, index) => (
            <li key={step} style={{ fontFamily: typography.subtitle, color: index === stepIndex ? colors.navy : colors.lightGray }}>
              {index + 1}. {step}
            </li>
          ))}
        </ol>
      </nav>
      <section style={cardStyle}>
        {currentStep === 'General' && <StepGeneral value={eventData} onChange={setEventData} />}
        {currentStep === 'Branding' && <StepBranding value={eventData} onChange={setEventData} />}
        {currentStep === 'Invitados' && <StepGuests guests={guests} onGuestsChange={setGuests} />}
      </section>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: spacing.lg }}>
        <button type="button" onClick={goPrevious} disabled={stepIndex === 0}>
          Anterior
        </button>
        {stepIndex < steps.length - 1 ? (
          <button type="button" onClick={goNext}>
            Siguiente
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creando…' : 'Finalizar'}
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

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
