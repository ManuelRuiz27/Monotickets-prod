'use client';

import React from 'react';
import { inputStyles, buttonStyles, spacing, typography, colors, parseStyles } from '@shared/theme';

export interface PaymentFormValues {
  organizerId: string;
  amount: string;
  currency: string;
  method: string;
  paidAt: string;
  note: string;
  reference: string;
}

interface PaymentFormProps {
  values: PaymentFormValues;
  organizers: { id: string; name: string }[];
  submitting?: boolean;
  error?: string | null;
  onChange: (values: PaymentFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const inputStyle = parseStyles(inputStyles);
const primaryButton = parseStyles(buttonStyles.primary);
const secondaryButton = parseStyles(buttonStyles.secondary);

const METHOD_OPTIONS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'otros', label: 'Otros' },
];

export function PaymentForm({ values, organizers, submitting, error, onChange, onSubmit, onCancel }: PaymentFormProps) {
  const handleChange = (field: keyof PaymentFormValues) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    onChange({ ...values, [field]: event.target.value });
  };

  return (
    <form
      aria-labelledby="payment-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      style={{ display: 'grid', gap: spacing.md }}
    >
      <h2 id="payment-form-title" style={titleStyle}>
        Registrar pago
      </h2>
      <p style={helperStyle}>
        Los campos marcados con * son obligatorios. Los totales se actualizarán al confirmar el registro.
      </p>
      <label style={labelStyle} htmlFor="payment-organizer">
        Organizador *
        <select
          id="payment-organizer"
          value={values.organizerId}
          onChange={handleChange('organizerId')}
          style={{ ...inputStyle, appearance: 'auto' }}
          required
        >
          <option value="">Selecciona un organizador</option>
          {organizers.map((organizer) => (
            <option key={organizer.id} value={organizer.id}>
              {organizer.name}
            </option>
          ))}
        </select>
      </label>
      <div style={gridStyle}>
        <label style={labelStyle} htmlFor="payment-amount">
          Monto *
          <input
            id="payment-amount"
            type="number"
            min="0"
            step="0.01"
            value={values.amount}
            onChange={handleChange('amount')}
            style={inputStyle}
            required
          />
        </label>
        <label style={labelStyle} htmlFor="payment-currency">
          Moneda
          <input
            id="payment-currency"
            type="text"
            value={values.currency}
            onChange={handleChange('currency')}
            style={inputStyle}
          />
        </label>
      </div>
      <div style={gridStyle}>
        <label style={labelStyle} htmlFor="payment-method">
          Método *
          <select
            id="payment-method"
            value={values.method}
            onChange={handleChange('method')}
            style={{ ...inputStyle, appearance: 'auto' }}
            required
          >
            {METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle} htmlFor="payment-date">
          Fecha de pago *
          <input
            id="payment-date"
            type="date"
            value={values.paidAt}
            onChange={handleChange('paidAt')}
            style={inputStyle}
            required
          />
        </label>
      </div>
      <label style={labelStyle} htmlFor="payment-reference">
        Referencia
        <input
          id="payment-reference"
          type="text"
          value={values.reference}
          onChange={handleChange('reference')}
          style={inputStyle}
          placeholder="Factura o folio"
        />
      </label>
      <label style={labelStyle} htmlFor="payment-note">
        Nota interna
        <textarea
          id="payment-note"
          value={values.note}
          onChange={handleChange('note')}
          style={{ ...inputStyle, minHeight: '100px' }}
          placeholder="Anota condiciones especiales o conciliaciones"
        />
      </label>
      {error && (
        <div role="alert" style={errorStyle}>
          {error}
        </div>
      )}
      <div style={actionsStyle}>
        <button type="button" onClick={onCancel} style={secondaryButton} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" style={primaryButton} disabled={submitting}>
          {submitting ? 'Registrando…' : 'Registrar pago'}
        </button>
      </div>
    </form>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.4rem',
  color: colors.navy,
  margin: 0,
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

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: spacing.sm,
};

const errorStyle: React.CSSProperties = {
  padding: spacing.sm,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.12)',
  color: colors.danger,
  fontFamily: typography.body,
};
