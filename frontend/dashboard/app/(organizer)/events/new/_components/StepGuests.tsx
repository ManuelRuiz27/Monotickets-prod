'use client';

import React from 'react';
import { typography, colors, spacing, inputStyles, buttonStyles } from '../../../../../shared/theme';

const inputStyle = parseStyles(inputStyles);
const primaryButton = parseStyles(buttonStyles.primary);
const ghostButton = parseStyles(buttonStyles.ghost);

export interface GuestDraft {
  id: string;
  name: string;
  email: string;
  phone: string;
  error?: string;
}

interface StepGuestsProps {
  guests: GuestDraft[];
  onGuestsChange: (guests: GuestDraft[]) => void;
}

export function StepGuests({ guests, onGuestsChange }: StepGuestsProps) {
  const [form, setForm] = React.useState<Omit<GuestDraft, 'id'>>({
    name: '',
    email: '',
    phone: '',
    error: undefined,
  });
  const [csv, setCsv] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const handleAddGuest = React.useCallback(() => {
    const validation = validateGuest(form);
    if (!validation.valid) {
      setFormError(validation.message);
      return;
    }
    const newGuest: GuestDraft = {
      id: generateId(),
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };
    onGuestsChange([...guests, newGuest]);
    setForm({ name: '', email: '', phone: '', error: undefined });
    setFormError(null);
  }, [form, guests, onGuestsChange]);

  const handleRemoveGuest = React.useCallback(
    (id: string) => {
      onGuestsChange(guests.filter((guest) => guest.id !== id));
    },
    [guests, onGuestsChange]
  );

  const handleCsvImport = React.useCallback(() => {
    const lines = csv
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = lines.map<GuestDraft>((line, index) => {
      const [name, email, phone] = line.split(',').map((segment) => segment?.trim() ?? '');
      const validation = validateGuest({ name, email, phone });
      return {
        id: generateId(),
        name,
        email,
        phone,
        error: validation.valid ? undefined : `Línea ${index + 1}: ${validation.message}`,
      };
    });
    onGuestsChange([...guests, ...parsed]);
    setCsv('');
  }, [csv, guests, onGuestsChange]);

  const hasErrors = guests.some((guest) => Boolean(guest.error));

  return (
    <section style={{ display: 'grid', gap: spacing.lg }}>
      <header>
        <h2 style={titleStyle}>Invitados</h2>
        <p style={helperStyle}>
          Agrega invitados manualmente o pega un CSV con nombre,email,telefono. Validamos que el teléfono tenga 10 dígitos.
        </p>
      </header>
      <div style={formGrid}>
        <label style={labelStyle} htmlFor="guest-name">
          Nombre
          <input
            id="guest-name"
            type="text"
            style={inputStyle}
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </label>
        <label style={labelStyle} htmlFor="guest-email">
          Correo electrónico
          <input
            id="guest-email"
            type="email"
            style={inputStyle}
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </label>
        <label style={labelStyle} htmlFor="guest-phone">
          Teléfono (10 dígitos)
          <input
            id="guest-phone"
            type="tel"
            inputMode="numeric"
            style={inputStyle}
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
        </label>
        <button type="button" onClick={handleAddGuest} style={{ ...primaryButton, alignSelf: 'end' }}>
          Agregar invitado
        </button>
      </div>
      {formError && (
        <p role="alert" style={{ ...helperStyle, color: colors.danger }}>
          {formError}
        </p>
      )}
      <label style={labelStyle} htmlFor="csv-import">
        Importar desde CSV
        <textarea
          id="csv-import"
          style={{ ...inputStyle, minHeight: '160px' }}
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          aria-describedby="csv-import-hint"
        />
      </label>
      <p id="csv-import-hint" style={helperStyle}>
        Usa una fila por invitado. Ejemplo: Ana López,ana@example.com,5512345678
      </p>
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleCsvImport} style={primaryButton} disabled={!csv.trim()}>
          Procesar CSV
        </button>
        <button type="button" onClick={() => setCsv('')} style={ghostButton}>
          Limpiar
        </button>
      </div>
      <section aria-live="polite" style={{ display: 'grid', gap: spacing.sm }}>
        <h3 style={subtitleStyle}>Vista previa ({guests.length})</h3>
        {hasErrors && (
          <p role="alert" style={{ ...helperStyle, color: colors.danger }}>
            Revisa los invitados marcados. Corrige el CSV o edita los campos manualmente.
          </p>
        )}
        <ul style={listStyle}>
          {guests.length === 0 && <li>No hay invitados agregados todavía.</li>}
          {guests.map((guest) => (
            <li
              key={guest.id}
              style={{
                ...listItemStyle,
                borderColor: guest.error ? colors.danger : colors.neutral,
                backgroundColor: guest.error ? 'rgba(239, 71, 111, 0.08)' : colors.white,
              }}
            >
              <div>
                <p style={guestNameStyle}>{guest.name}</p>
                <p style={guestMetaStyle}>{guest.email} · {formatPhone(guest.phone)}</p>
                {guest.error && <p style={{ ...helperStyle, color: colors.danger }}>{guest.error}</p>}
              </div>
              <button type="button" onClick={() => handleRemoveGuest(guest.id)} style={ghostButton}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function validateGuest(guest: { name: string; email: string; phone: string }) {
  if (!guest.name.trim()) return { valid: false, message: 'El nombre es obligatorio' };
  if (!guest.email.trim() || !guest.email.includes('@')) return { valid: false, message: 'Correo inválido' };
  const phoneDigits = guest.phone.replace(/\D/g, '');
  if (phoneDigits.length !== 10) return { valid: false, message: 'El teléfono debe tener 10 dígitos' };
  return { valid: true };
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const formGrid: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  alignItems: 'end',
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
  color: colors.navy,
  margin: 0,
};

const guestMetaStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
