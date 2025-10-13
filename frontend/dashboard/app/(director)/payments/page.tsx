'use client';

import React from 'react';
import {
  getPayments,
  createPayment,
  getDirectorOrganizers,
  getDirectorOverview,
  type OrganizerRecord,
} from '@/lib/api/director';
import { dialogStyles, spacing, typography, colors, cardStyles, parseStyles, buttonStyles } from '@shared/theme';
import { PaymentForm, type PaymentFormValues } from '../_components/PaymentForm';
import { PaymentsTable, type PaymentsFilters, type PaymentRow } from '../_components/PaymentsTable';

const overlayStyle = parseStyles(dialogStyles.overlay);
const dialogContentStyle = parseStyles(dialogStyles.content);
const primaryButton = parseStyles(buttonStyles.primary);
const cardStyle = parseStyles(cardStyles);

const INITIAL_FILTERS: PaymentsFilters = {
  organizerId: '',
  status: 'all',
  from: '',
  to: '',
};

const INITIAL_FORM: PaymentFormValues = {
  organizerId: '',
  amount: '',
  currency: 'MXN',
  method: 'transferencia',
  paidAt: formatDateInput(new Date()),
  note: '',
  reference: '',
};

export default function DirectorPaymentsPage() {
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [filters, setFilters] = React.useState<PaymentsFilters>(INITIAL_FILTERS);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [formValues, setFormValues] = React.useState<PaymentFormValues>(INITIAL_FORM);
  const [showForm, setShowForm] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [organizerRecords, setOrganizerRecords] = React.useState<OrganizerRecord[]>([]);
  const [totals, setTotals] = React.useState<{ revenue: number; outstanding: number; commissions: number; currency: string } | null>(null);

  const loadOrganizers = React.useCallback(async () => {
    try {
      const data = await getDirectorOrganizers();
      setOrganizerRecords(data);
      if (!formValues.organizerId && data.length > 0) {
        setFormValues((current) => ({ ...current, organizerId: data[0].id, currency: data[0].currency ?? current.currency }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar los organizadores.');
    }
  }, [formValues.organizerId]);

  const loadPayments = React.useCallback(
    async (currentFilters: PaymentsFilters = filters) => {
      setLoading(true);
      try {
        const params: Parameters<typeof getPayments>[0] = {};
        if (currentFilters.organizerId) params.organizerId = currentFilters.organizerId;
        if (currentFilters.status !== 'all') params.status = currentFilters.status;
        if (currentFilters.from) params.from = currentFilters.from;
        if (currentFilters.to) params.to = currentFilters.to;
        const data = await getPayments(params);
        setPayments(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pudimos obtener los pagos.');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const loadOverview = React.useCallback(async () => {
    try {
      const overview = await getDirectorOverview();
      setTotals(overview.totals);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('No se pudo actualizar el resumen financiero', err);
      }
    }
  }, []);

  React.useEffect(() => {
    loadOrganizers();
    loadPayments();
    loadOverview();
  }, [loadOrganizers, loadPayments, loadOverview]);

  const handleFiltersChange = (next: PaymentsFilters) => {
    setFilters(next);
    loadPayments(next);
  };

  const handleSubmitPayment = async () => {
    if (!formValues.organizerId) {
      setFormError('Selecciona un organizador.');
      return;
    }
    if (!formValues.amount || Number(formValues.amount) <= 0) {
      setFormError('Ingresa un monto válido.');
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const optimistic: PaymentRow = {
      id: `temp-${Date.now()}`,
      organizerId: formValues.organizerId,
      organizerName: organizers.find((item) => item.id === formValues.organizerId)?.name ?? 'Organizador',
      amount: Number(formValues.amount),
      currency: formValues.currency,
      method: formValues.method,
      status: 'pending',
      paidAt: new Date(formValues.paidAt).toISOString(),
      createdAt: new Date().toISOString(),
      reference: formValues.reference || undefined,
      note: formValues.note || undefined,
      optimistic: true,
      draft: formValues,
    };

    setPayments((current) => [optimistic, ...current]);

    try {
      const payload = {
        organizerId: formValues.organizerId,
        amount: Number(formValues.amount),
        currency: formValues.currency,
        method: formValues.method,
        paidAt: new Date(formValues.paidAt).toISOString(),
        note: formValues.note || undefined,
        reference: formValues.reference || undefined,
      };
      const record = await createPayment(payload);
      setPayments((current) =>
        current.map((payment) =>
          payment.id === optimistic.id
            ? { ...record }
            : payment
        )
      );
      setShowForm(false);
      setFormValues((current) => ({ ...current, amount: '', note: '', reference: '' }));
      loadPayments(filters);
      loadOverview();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'El pago no pudo registrarse.';
      setFormError(message);
      setPayments((current) =>
        current.map((payment) =>
          payment.id === optimistic.id
            ? { ...payment, status: 'failed', optimistic: false }
            : payment
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (payment: PaymentRow) => {
    if (!payment.draft) return;
    setFormValues(payment.draft);
    setShowForm(true);
    setFormError('El intento anterior falló. Revisa los datos y vuelve a enviar.');
  };

  return (
    <main aria-labelledby="director-payments-title" style={{ padding: spacing.xl }}>
      <header style={headerStyle}>
        <div>
          <h1 id="director-payments-title" style={titleStyle}>
            Pagos
          </h1>
          <p style={subtitleStyle}>
            Registra ingresos, concilia deudas y consulta el historial con filtros avanzados.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} style={primaryButton}>
          Registrar pago
        </button>
      </header>

      {totals && (
        <section style={{ ...cardStyle, marginBottom: spacing.lg }} aria-live="polite">
          <h2 style={sectionTitle}>Resumen financiero</h2>
          <div style={totalsGrid}>
            <div>
              <p style={totalsLabel}>Ingresos acumulados</p>
              <p style={totalsValue}>{formatCurrency(totals.revenue, totals.currency)}</p>
            </div>
            <div>
              <p style={totalsLabel}>Cuentas por cobrar</p>
              <p style={totalsValue}>{formatCurrency(totals.outstanding, totals.currency)}</p>
            </div>
            <div>
              <p style={totalsLabel}>Comisiones</p>
              <p style={totalsValue}>{formatCurrency(totals.commissions, totals.currency)}</p>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" style={errorBanner}>
          {error}
        </div>
      )}

      <PaymentsTable
        filters={filters}
        organizers={organizerRecords.map((organizer) => ({ id: organizer.id, name: organizer.name }))}
        payments={payments}
        loading={loading}
        onFiltersChange={handleFiltersChange}
        onRetry={handleRetry}
      />

      {showForm && (
        <div role="dialog" aria-modal="true" aria-labelledby="payment-form-title" style={overlayStyle}>
          <div style={dialogContentStyle}>
            <PaymentForm
              values={formValues}
              organizers={organizerRecords.map((organizer) => ({ id: organizer.id, name: organizer.name }))}
              submitting={submitting}
              error={formError}
              onChange={(next) => {
                const selected = organizerRecords.find((item) => item.id === next.organizerId);
                setFormValues({
                  ...next,
                  currency: selected?.currency ?? next.currency,
                });
              }}
              onSubmit={handleSubmitPayment}
              onCancel={() => {
                setShowForm(false);
                setFormError(null);
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: spacing.md,
  marginBottom: spacing.lg,
};

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  marginBottom: spacing.sm,
};

const totalsGrid: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
};

const totalsLabel: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
  margin: 0,
};

const totalsValue: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  fontSize: '1.4rem',
  margin: 0,
};

const errorBanner: React.CSSProperties = {
  marginBottom: spacing.md,
  padding: spacing.md,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.12)',
  color: colors.danger,
  fontFamily: typography.body,
};
