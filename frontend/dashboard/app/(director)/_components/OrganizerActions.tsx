'use client';

import React from 'react';
import {
  OrganizerRecord,
  grantTickets,
  recordPayment,
  updatePricing,
  GrantPayload,
} from '@/lib/api/director';
import { colors, typography, spacing, inputStyles, buttonStyles } from '@shared/theme';

const inputStyle = parseStyles(inputStyles);
const primaryButton = parseStyles(buttonStyles.primary);
const secondaryButton = parseStyles(buttonStyles.secondary);
const ghostButton = parseStyles(buttonStyles.ghost);

interface OrganizerActionsProps {
  organizer?: OrganizerRecord;
  onUpdated?: () => void;
}

export function OrganizerActions({ organizer, onUpdated }: OrganizerActionsProps) {
  const [grant, setGrant] = React.useState<GrantPayload>({ type: 'prepaid', tickets: 0 });
  const [payment, setPayment] = React.useState({ amount: 0, currency: 'MXN', paidAt: new Date().toISOString().slice(0, 16), note: '' });
  const [pricing, setPricing] = React.useState({ price: organizer?.pricePerTicket ?? 0, currency: organizer?.currency ?? 'MXN' });
  const [status, setStatus] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (organizer) {
      setPricing({ price: organizer.pricePerTicket ?? 0, currency: organizer.currency });
    }
  }, [organizer]);

  if (!organizer) {
    return (
      <aside aria-live="polite" style={emptyStateStyle}>
        <p style={helperStyle}>Selecciona un organizador para administrar tickets, pagos y precio por ticket.</p>
      </aside>
    );
  }

  const handleGrant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (grant.tickets <= 0) {
      setStatus('Ingresa un número de tickets válido.');
      return;
    }
    setLoading(true);
    try {
      await grantTickets(organizer.id, grant);
      setStatus('Asignación registrada correctamente.');
      onUpdated?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo registrar la asignación');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (payment.amount <= 0) {
      setStatus('El monto debe ser mayor a 0.');
      return;
    }
    setLoading(true);
    try {
      await recordPayment(organizer.id, {
        amount: payment.amount,
        currency: payment.currency,
        paidAt: new Date(payment.paidAt).toISOString(),
        note: payment.note,
      });
      setStatus('Pago registrado.');
      onUpdated?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo registrar el pago');
    } finally {
      setLoading(false);
    }
  };

  const handlePricing = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pricing.price <= 0) {
      setStatus('Define un precio mayor a 0.');
      return;
    }
    setLoading(true);
    try {
      await updatePricing(organizer.id, pricing);
      setStatus('Precio actualizado.');
      onUpdated?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo actualizar el precio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside style={{ display: 'grid', gap: spacing.lg }} aria-live="polite">
      <header>
        <h2 style={titleStyle}>Acciones para {organizer.name}</h2>
        <p style={helperStyle}>Saldo actual: {organizer.outstandingBalance.toLocaleString(undefined, { style: 'currency', currency: organizer.currency })}</p>
      </header>
      <form onSubmit={handleGrant} style={formStyle}>
        <h3 style={subtitleStyle}>Asignar tickets</h3>
        <label style={labelStyle}>
          Tipo
          <select
            value={grant.type}
            onChange={(event) => setGrant((prev) => ({ ...prev, type: event.target.value as GrantPayload['type'] }))}
            style={inputStyle}
          >
            <option value="prepaid">Prepago</option>
            <option value="loan">Préstamo</option>
          </select>
        </label>
        <label style={labelStyle}>
          Cantidad
          <input
            type="number"
            min={1}
            value={grant.tickets}
            onChange={(event) => setGrant((prev) => ({ ...prev, tickets: Number(event.target.value) }))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Referencia (opcional)
          <input
            type="text"
            value={grant.reference ?? ''}
            onChange={(event) => setGrant((prev) => ({ ...prev, reference: event.target.value || undefined }))}
            style={inputStyle}
          />
        </label>
        <button type="submit" style={primaryButton} disabled={loading}>
          Asignar
        </button>
      </form>
      <form onSubmit={handlePayment} style={formStyle}>
        <h3 style={subtitleStyle}>Registrar pago</h3>
        <label style={labelStyle}>
          Monto
          <input
            type="number"
            min={1}
            value={payment.amount}
            onChange={(event) => setPayment((prev) => ({ ...prev, amount: Number(event.target.value) }))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Moneda
          <select
            value={payment.currency}
            onChange={(event) => setPayment((prev) => ({ ...prev, currency: event.target.value }))}
            style={inputStyle}
          >
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label style={labelStyle}>
          Fecha de pago
          <input
            type="datetime-local"
            value={payment.paidAt}
            onChange={(event) => setPayment((prev) => ({ ...prev, paidAt: event.target.value }))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Nota
          <textarea
            value={payment.note}
            onChange={(event) => setPayment((prev) => ({ ...prev, note: event.target.value }))}
            style={{ ...inputStyle, minHeight: '96px' }}
          />
        </label>
        <button type="submit" style={secondaryButton} disabled={loading}>
          Registrar pago
        </button>
      </form>
      <form onSubmit={handlePricing} style={formStyle}>
        <h3 style={subtitleStyle}>Precio por ticket</h3>
        <label style={labelStyle}>
          Precio
          <input
            type="number"
            min={1}
            value={pricing.price}
            onChange={(event) => setPricing((prev) => ({ ...prev, price: Number(event.target.value) }))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Moneda
          <select
            value={pricing.currency}
            onChange={(event) => setPricing((prev) => ({ ...prev, currency: event.target.value }))}
            style={inputStyle}
          >
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <button type="submit" style={ghostButton} disabled={loading}>
          Actualizar precio
        </button>
      </form>
      {status && (
        <p role="status" style={{ ...helperStyle, color: colors.navy }}>
          {status}
        </p>
      )}
    </aside>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.5rem',
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  marginBottom: spacing.xs,
};

const helperStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
};

const formStyle: React.CSSProperties = {
  border: `1px solid ${colors.neutral}`,
  borderRadius: '12px',
  padding: spacing.md,
  display: 'grid',
  gap: spacing.md,
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const emptyStateStyle: React.CSSProperties = {
  border: `1px dashed ${colors.neutral}`,
  borderRadius: '12px',
  padding: spacing.lg,
  fontFamily: typography.body,
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
