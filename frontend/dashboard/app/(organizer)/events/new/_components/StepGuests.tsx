'use client';

import React from 'react';
import { typography, colors, spacing, inputStyles } from '../../../../../shared/theme';

const inputStyle = parseStyles(inputStyles);

interface StepGuestsProps {
  guests: GuestDraft[];
  onGuestsChange: (guests: GuestDraft[]) => void;
}

export interface GuestDraft {
  name: string;
  email: string;
}

export function StepGuests({ guests, onGuestsChange }: StepGuestsProps) {
  const [localGuest, setLocalGuest] = React.useState<GuestDraft>({ name: '', email: '' });
  const [csv, setCsv] = React.useState('');

  const addGuest = React.useCallback(() => {
    if (!localGuest.name || !localGuest.email) return;
    onGuestsChange([...guests, localGuest]);
    setLocalGuest({ name: '', email: '' });
  }, [guests, localGuest, onGuestsChange]);

  const handleCsvImport = React.useCallback(() => {
    const lines = csv
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = lines.map((line) => {
      const [name, email] = line.split(',');
      return { name: name?.trim() ?? '', email: email?.trim() ?? '' };
    });
    onGuestsChange([...guests, ...parsed.filter((item) => item.name && item.email)]);
    setCsv('');
  }, [csv, guests, onGuestsChange]);

  return (
    <section>
      <h2 style={{ fontFamily: typography.subtitle, color: colors.navy }}>Invitados</h2>
      <div style={{ display: 'grid', gap: spacing.md, marginBottom: spacing.lg }}>
        <label style={labelStyle} htmlFor="guest-name">
          Nombre
          <input
            id="guest-name"
            type="text"
            style={inputStyle}
            value={localGuest.name}
            onChange={(event) => setLocalGuest({ ...localGuest, name: event.target.value })}
          />
        </label>
        <label style={labelStyle} htmlFor="guest-email">
          Correo electrónico
          <input
            id="guest-email"
            type="email"
            style={inputStyle}
            value={localGuest.email}
            onChange={(event) => setLocalGuest({ ...localGuest, email: event.target.value })}
          />
        </label>
        <button type="button" onClick={addGuest}>
          Agregar invitado
        </button>
      </div>
      <label style={labelStyle} htmlFor="csv-import">
        Importar desde CSV
        <textarea
          id="csv-import"
          style={{ ...inputStyle, minHeight: '140px' }}
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          aria-describedby="csv-import-hint"
        />
      </label>
      <p id="csv-import-hint" style={{ fontFamily: typography.body, color: colors.lightGray }}>
        Formato esperado: nombre,correo por línea.
      </p>
      <button type="button" onClick={handleCsvImport}>
        Procesar CSV
      </button>
      <section aria-live="polite" style={{ marginTop: spacing.lg }}>
        <h3 style={{ fontFamily: typography.subtitle, color: colors.navy }}>Vista previa</h3>
        <ul>
          {guests.length === 0 && <li>No hay invitados agregados aún.</li>}
          {guests.map((guest, index) => (
            <li key={`${guest.email}-${index}`} style={{ fontFamily: typography.body }}>
              {guest.name} — {guest.email}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
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
