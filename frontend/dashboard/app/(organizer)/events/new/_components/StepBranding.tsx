'use client';

import React from 'react';
import { typography, colors, spacing, inputStyles } from '../../../../../shared/theme';
import { EventDetail } from '../../../../../lib/api/organizer';

const inputStyle = parseStyles(inputStyles);

interface StepBrandingProps {
  value: Partial<EventDetail>;
  onChange: (value: Partial<EventDetail>) => void;
}

export function StepBranding({ value, onChange }: StepBrandingProps) {
  return (
    <fieldset style={{ border: 'none', padding: 0 }}>
      <legend style={{ fontFamily: typography.subtitle, color: colors.navy, marginBottom: spacing.md }}>
        Branding y medios
      </legend>
      <p style={{ fontFamily: typography.body, color: colors.lightGray, marginBottom: spacing.md }}>
        Sube metadatos de portada y galería. Los binarios se envían al CDN según el ADR de media.
      </p>
      <label style={labelStyle} htmlFor="cover-url">
        URL de portada
        <input
          id="cover-url"
          type="url"
          style={inputStyle}
          value={value.cover_url ?? ''}
          onChange={(event) => onChange({ ...value, cover_url: event.target.value })}
        />
      </label>
      <label style={labelStyle} htmlFor="gallery">
        URLs de galería (separadas por coma)
        <textarea
          id="gallery"
          style={{ ...inputStyle, minHeight: '120px' }}
          value={value.gallery_urls?.join(', ') ?? ''}
          onChange={(event) =>
            onChange({ ...value, gallery_urls: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })
          }
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
