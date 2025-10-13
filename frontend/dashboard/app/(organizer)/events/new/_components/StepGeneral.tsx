'use client';

import React from 'react';
import { typography, colors, spacing, inputStyles } from '@shared/theme';
import { EventDetail } from '@/lib/api/organizer';

const inputStyle = parseStyles(inputStyles);

interface StepGeneralProps {
  value: Partial<EventDetail>;
  onChange: (value: Partial<EventDetail>) => void;
}

export function StepGeneral({ value, onChange }: StepGeneralProps) {
  return (
    <fieldset style={{ border: 'none', padding: 0 }}>
      <legend style={{ fontFamily: typography.subtitle, color: colors.navy, marginBottom: spacing.md }}>
        Información general
      </legend>
      <label style={labelStyle} htmlFor="event-name">
        Nombre del evento
        <input
          id="event-name"
          name="name"
          type="text"
          required
          style={inputStyle}
          value={value.name ?? ''}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <label style={labelStyle} htmlFor="event-date">
        Fecha y hora
        <input
          id="event-date"
          name="startsAt"
          type="datetime-local"
          required
          style={inputStyle}
          value={value.startsAt ?? ''}
          onChange={(event) => onChange({ ...value, startsAt: event.target.value })}
        />
      </label>
      <label style={labelStyle} htmlFor="event-type">
        Tipo de evento
        <select
          id="event-type"
          name="type"
          style={inputStyle}
          value={value.type ?? 'standard'}
          onChange={(event) => onChange({ ...value, type: event.target.value as EventDetail['type'] })}
        >
          <option value="standard">Estándar</option>
          <option value="premium">Premium</option>
        </select>
      </label>
      <label style={labelStyle} htmlFor="event-ttl">
        Días activos para la landing
        <input
          id="event-ttl"
          name="landingTtlDays"
          type="number"
          min={1}
          style={inputStyle}
          value={value.landingTtlDays ?? 7}
          onChange={(event) => onChange({ ...value, landingTtlDays: Number(event.target.value) })}
        />
      </label>
    </fieldset>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontFamily: typography.body,
  color: colors.navy,
  gap: spacing.xs,
  marginBottom: spacing.md,
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
