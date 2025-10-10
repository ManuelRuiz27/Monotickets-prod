'use client';

import React from 'react';
import { getPayments, createPayment, PaymentRecord } from '../../../lib/api/director';
import { colors, spacing, typography, inputStyles } from '../../../shared/theme';

const inputStyle = parseStyles(inputStyles);

export default function DirectorPaymentsPage() {
  const [payments, setPayments] = React.useState<PaymentRecord[]>([]);
  const [form, setForm] = React.useState({ organizerId: '', amount: '', currency: 'MXN', reference: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const loadPayments = React.useCallback(async () => {
    try {
      const data = await getPayments();
      setPayments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }, []);

  React.useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createPayment({
        organizerId: form.organizerId,
        amount: Number(form.amount),
        currency: form.currency,
        reference: form.reference,
      });
      setForm({ organizerId: '', amount: '', currency: 'MXN', reference: '' });
      setStatus('Pago registrado correctamente.');
      setError(null);
      loadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setStatus(null);
    }
  };

  return (
    <main aria-labelledby="director-payments-title" style={{ padding: spacing.xl }}>
      <h1 id="director-payments-title" style={titleStyle}>
        Pagos
      </h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: spacing.md, marginBottom: spacing.xl }}>
        <label style={labelStyle} htmlFor="payment-organizer">
          ID del organizador
          <input
            id="payment-organizer"
            type="text"
            style={inputStyle}
            value={form.organizerId}
            onChange={(event) => setForm({ ...form, organizerId: event.target.value })}
            required
          />
        </label>
        <label style={labelStyle} htmlFor="payment-amount">
          Monto
          <input
            id="payment-amount"
            type="number"
            min={0}
            step="0.01"
            style={inputStyle}
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            required
          />
        </label>
        <label style={labelStyle} htmlFor="payment-currency">
          Moneda
          <input
            id="payment-currency"
            type="text"
            style={inputStyle}
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
            required
          />
        </label>
        <label style={labelStyle} htmlFor="payment-reference">
          Referencia
          <input
            id="payment-reference"
            type="text"
            style={inputStyle}
            value={form.reference}
            onChange={(event) => setForm({ ...form, reference: event.target.value })}
            required
          />
        </label>
        <button type="submit">Registrar pago</button>
      </form>
      {status && (
        <p role="status" style={{ fontFamily: typography.body, color: colors.sky }}>
          {status}
        </p>
      )}
      {error && (
        <div role="alert" style={{ color: colors.danger, marginTop: spacing.sm }}>
          {error}
        </div>
      )}
      <section aria-live="polite" style={{ marginTop: spacing.lg }}>
        <h2 style={sectionTitle}>Pagos recientes</h2>
        <ul>
          {payments.map((payment) => (
            <li key={payment.id} style={{ fontFamily: typography.body }}>
              {payment.reference} — {payment.amount} {payment.currency} ({payment.status})
            </li>
          ))}
          {payments.length === 0 && <li>No hay pagos registrados.</li>}
        </ul>
      </section>
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
};

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
