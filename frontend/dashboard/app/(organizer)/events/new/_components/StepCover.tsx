'use client';

import React from 'react';
import { colors, typography, spacing, inputStyles, buttonStyles } from '../../../../../shared/theme';

export interface CoverData {
  name: string;
  description: string;
  location: string;
  startDate: string;
  endDate?: string;
  type: 'standard' | 'premium';
  coverUrl?: string;
  pdfUrl?: string;
  flipbookUrl?: string;
  landingUrl?: string;
  landingTtlDays: number;
}

interface StepCoverProps {
  value: CoverData;
  onChange: (value: CoverData) => void;
}

const inputStyle = parseStyles(inputStyles);
const ghostButton = parseStyles(buttonStyles.ghost);

export function StepCover({ value, onChange }: StepCoverProps) {
  const handleFieldChange = React.useCallback(
    (field: keyof CoverData, fieldValue: string) => {
      onChange({ ...value, [field]: field === 'landingTtlDays' ? Number(fieldValue) : fieldValue });
    },
    [onChange, value]
  );

  return (
    <section style={{ display: 'grid', gap: spacing.lg }}>
      <header>
        <h2 style={titleStyle}>Portada y landing pública</h2>
        <p style={helperStyle}>
          Personaliza los datos principales del evento. Estos campos se reflejan en la invitación y en la landing de
          confirmación.
        </p>
      </header>
      <div style={gridTwoCols}>
        <label style={labelStyle} htmlFor="event-name">
          Nombre del evento
          <input
            id="event-name"
            type="text"
            required
            value={value.name}
            onChange={(event) => handleFieldChange('name', event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle} htmlFor="event-location">
          Ubicación
          <input
            id="event-location"
            type="text"
            value={value.location}
            onChange={(event) => handleFieldChange('location', event.target.value)}
            style={inputStyle}
            placeholder="Hotel, salón o streaming"
          />
        </label>
        <label style={labelStyle} htmlFor="event-start">
          Inicio
          <input
            id="event-start"
            type="datetime-local"
            value={value.startDate}
            onChange={(event) => handleFieldChange('startDate', event.target.value)}
            style={inputStyle}
            required
          />
        </label>
        <label style={labelStyle} htmlFor="event-end">
          Fin (opcional)
          <input
            id="event-end"
            type="datetime-local"
            value={value.endDate ?? ''}
            onChange={(event) => handleFieldChange('endDate', event.target.value)}
            style={inputStyle}
          />
        </label>
      </div>
      <label style={labelStyle} htmlFor="event-description">
        Descripción breve
        <textarea
          id="event-description"
          style={{ ...inputStyle, minHeight: '120px' }}
          value={value.description}
          onChange={(event) => handleFieldChange('description', event.target.value)}
          placeholder="Comparte detalles clave, dress code o itinerario"
        />
      </label>
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Tipo de landing</legend>
        <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="landing-kind"
              value="standard"
              checked={value.type === 'standard'}
              onChange={() => handleFieldChange('type', 'standard')}
            />
            Estándar (PDF)
          </label>
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="landing-kind"
              value="premium"
              checked={value.type === 'premium'}
              onChange={() => handleFieldChange('type', 'premium')}
            />
            Premium (flipbook)
          </label>
        </div>
        <p style={helperStyle}>
          Elige Premium para integrar un flipbook interactivo. Si seleccionas Estándar, se mostrará un PDF descargable.
        </p>
      </fieldset>
      <div style={gridTwoCols}>
        <label style={labelStyle} htmlFor="event-cover">
          Portada (URL a CDN)
          <input
            id="event-cover"
            type="url"
            placeholder="https://cdn.tuempresa.com/portada.jpg"
            value={value.coverUrl ?? ''}
            onChange={(event) => handleFieldChange('coverUrl', event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle} htmlFor="event-landing">
          URL de landing personalizada
          <input
            id="event-landing"
            type="url"
            placeholder="https://monotickets.com/tuevento"
            value={value.landingUrl ?? ''}
            onChange={(event) => handleFieldChange('landingUrl', event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle} htmlFor="event-pdf">
          PDF de invitación
          <input
            id="event-pdf"
            type="url"
            placeholder="https://cdn.tuempresa.com/invitacion.pdf"
            value={value.pdfUrl ?? ''}
            onChange={(event) => handleFieldChange('pdfUrl', event.target.value)}
            style={inputStyle}
            disabled={value.type !== 'standard'}
          />
        </label>
        <label style={labelStyle} htmlFor="event-flipbook">
          Flipbook (URL embed)
          <input
            id="event-flipbook"
            type="url"
            placeholder="https://viewer.tuempresa.com/flipbook"
            value={value.flipbookUrl ?? ''}
            onChange={(event) => handleFieldChange('flipbookUrl', event.target.value)}
            style={inputStyle}
            disabled={value.type !== 'premium'}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
        <label style={labelStyle} htmlFor="landing-ttl">
          Días de vigencia de la landing
          <input
            id="landing-ttl"
            type="number"
            min={1}
            value={value.landingTtlDays}
            onChange={(event) => handleFieldChange('landingTtlDays', event.target.value)}
            style={inputStyle}
          />
        </label>
        <button
          type="button"
          style={ghostButton}
          onClick={() => handleFieldChange('landingTtlDays', '7')}
        >
          Restablecer a 7 días
        </button>
      </div>
    </section>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.5rem',
  marginBottom: spacing.sm,
};

const helperStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const gridTwoCols: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
};

const fieldsetStyle: React.CSSProperties = {
  border: `1px solid ${colors.neutral}`,
  borderRadius: '12px',
  padding: spacing.md,
  display: 'grid',
  gap: spacing.sm,
};

const legendStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
};

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  fontFamily: typography.body,
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
