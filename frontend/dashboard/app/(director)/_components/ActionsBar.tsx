'use client';

import React from 'react';
import {
  grantTickets,
  updatePricing,
  createPayment,
  OrganizerRecord,
  PricingUpdatePayload,
} from '../../../lib/api/director';
import { colors, spacing, typography, inputStyles } from '../../../shared/theme';

const inputStyle = parseStyles(inputStyles);

interface ActionsBarProps {
  organizer?: OrganizerRecord;
  onUpdated: () => void;
}

export function ActionsBar({ organizer, onUpdated }: ActionsBarProps) {
  const [tickets, setTickets] = React.useState('');
  const [pricing, setPricing] = React.useState<PricingUpdatePayload>({ price: 0, currency: 'MXN' });
  const [payment, setPayment] = React.useState({ amount: '', currency: 'MXN', reference: '' });
  const [status, setStatus] = React.useState<string | null>(null);

  const disabled = !organizer;

  const submitGrant = async () => {
    if (!organizer) return;
    await grantTickets(organizer.id, Number(tickets));
    setTickets('');
    onUpdated();
    setStatus('Tickets otorgados correctamente.');
  };

  const submitPricing = async () => {
    if (!organizer) return;
    await updatePricing(organizer.id, pricing);
    onUpdated();
    setStatus('Pricing actualizado.');
  };

  const submitPayment = async () => {
    if (!organizer) return;
    await createPayment({
      organizerId: organizer.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      reference: payment.reference,
    });
    setPayment({ amount: '', currency: payment.currency, reference: '' });
    onUpdated();
    setStatus('Pago registrado.');
  };

  return (
    <aside style={{ padding: spacing.lg, border: `1px solid ${colors.neutral}`, borderRadius: '12px' }}>
      <h2 style={{ fontFamily: typography.subtitle, color: colors.navy }}>Acciones</h2>
      {!organizer ? (
        <p style={{ fontFamily: typography.body, color: colors.lightGray }}>
          Selecciona un organizador para aplicar acciones.
        </p>
      ) : (
        <p style={{ fontFamily: typography.body }}>
          Acciones para <strong>{organizer.name}</strong>
        </p>
      )}
      <section aria-label="Otorgar tickets" style={{ marginTop: spacing.md }}>
        <h3 style={sectionTitle}>Otorgar tickets/préstamos</h3>
        <label style={labelStyle} htmlFor="tickets-grant">
          Cantidad
          <input
            id="tickets-grant"
            type="number"
            min={1}
            style={inputStyle}
            value={tickets}
            disabled={disabled}
            onChange={(event) => setTickets(event.target.value)}
          />
        </label>
        <button type="button" disabled={disabled} onClick={submitGrant}>
          Otorgar
        </button>
      </section>
      <section aria-label="Actualizar pricing" style={{ marginTop: spacing.lg }}>
        <h3 style={sectionTitle}>Actualizar pricing</h3>
        <label style={labelStyle} htmlFor="pricing-price">
          Precio
          <input
            id="pricing-price"
            type="number"
            min={0}
            style={inputStyle}
            value={pricing.price}
            disabled={disabled}
            onChange={(event) => setPricing({ ...pricing, price: Number(event.target.value) })}
          />
        </label>
        <label style={labelStyle} htmlFor="pricing-currency">
          Moneda
          <input
            id="pricing-currency"
            type="text"
            style={inputStyle}
            value={pricing.currency}
            disabled={disabled}
            onChange={(event) => setPricing({ ...pricing, currency: event.target.value })}
          />
        </label>
        <button type="button" disabled={disabled} onClick={submitPricing}>
          Actualizar pricing
        </button>
      </section>
      <section aria-label="Registrar pago" style={{ marginTop: spacing.lg }}>
        <h3 style={sectionTitle}>Registrar pago</h3>
        <label style={labelStyle} htmlFor="payment-amount">
          Monto
          <input
            id="payment-amount"
            type="number"
            min={0}
            style={inputStyle}
            value={payment.amount}
            disabled={disabled}
            onChange={(event) => setPayment({ ...payment, amount: event.target.value })}
          />
        </label>
        <label style={labelStyle} htmlFor="payment-currency">
          Moneda
          <input
            id="payment-currency"
            type="text"
            style={inputStyle}
            value={payment.currency}
            disabled={disabled}
            onChange={(event) => setPayment({ ...payment, currency: event.target.value })}
          />
        </label>
        <label style={labelStyle} htmlFor="payment-reference">
          Referencia
          <input
            id="payment-reference"
            type="text"
            style={inputStyle}
            value={payment.reference}
            disabled={disabled}
            onChange={(event) => setPayment({ ...payment, reference: event.target.value })}
          />
        </label>
        <button type="button" disabled={disabled} onClick={submitPayment}>
          Registrar pago
        </button>
      </section>
      {status && (
        <p role="status" style={{ fontFamily: typography.body, color: colors.sky, marginTop: spacing.lg }}>
          {status}
        </p>
      )}
    </aside>
  );
}

const sectionTitle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontFamily: typography.body,
  color: colors.navy,
  marginBottom: spacing.sm,
};

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
