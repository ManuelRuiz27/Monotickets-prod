'use client';

import React from 'react';
import type { PaymentRecord, PaymentStatus } from '@/lib/api/director';
import { spacing, typography, colors, inputStyles, buttonStyles, tableStyles, parseStyles } from '@shared/theme';
import type { PaymentFormValues } from './PaymentForm';

export interface PaymentsFilters {
  organizerId: string;
  status: 'all' | PaymentStatus;
  from: string;
  to: string;
}

export interface PaymentRow extends PaymentRecord {
  optimistic?: boolean;
  draft?: PaymentFormValues;
}

interface PaymentsTableProps {
  filters: PaymentsFilters;
  organizers: { id: string; name: string }[];
  payments: PaymentRow[];
  loading?: boolean;
  onFiltersChange: (filters: PaymentsFilters) => void;
  onRetry: (payment: PaymentRow) => void;
}

const inputStyle = parseStyles(inputStyles);
const ghostButton = parseStyles(buttonStyles.ghost);
const tableStyle = parseStyles(tableStyles);

export function PaymentsTable({ filters, organizers, payments, loading, onFiltersChange, onRetry }: PaymentsTableProps) {
  const handleFilterChange = (field: keyof PaymentsFilters) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    onFiltersChange({ ...filters, [field]: event.target.value } as PaymentsFilters);
  };

  const filteredOrganizers = React.useMemo(() => organizers.sort((a, b) => a.name.localeCompare(b.name)), [organizers]);

  return (
    <section aria-live="polite" style={{ display: 'grid', gap: spacing.md }}>
      <form
        style={filterGrid}
        onSubmit={(event) => event.preventDefault()}
        aria-label="Filtros de pagos"
      >
        <label style={filterLabel} htmlFor="payments-organizer">
          Organizador
          <select
            id="payments-organizer"
            value={filters.organizerId}
            onChange={handleFilterChange('organizerId')}
            style={{ ...inputStyle, appearance: 'auto' }}
          >
            <option value="">Todos</option>
            {filteredOrganizers.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>
                {organizer.name}
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabel} htmlFor="payments-status">
          Estado
          <select
            id="payments-status"
            value={filters.status}
            onChange={handleFilterChange('status')}
            style={{ ...inputStyle, appearance: 'auto' }}
          >
            <option value="all">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="paid">Pagados</option>
            <option value="failed">Fallidos</option>
          </select>
        </label>
        <label style={filterLabel} htmlFor="payments-from">
          Desde
          <input
            id="payments-from"
            type="date"
            value={filters.from}
            onChange={handleFilterChange('from')}
            style={inputStyle}
          />
        </label>
        <label style={filterLabel} htmlFor="payments-to">
          Hasta
          <input
            id="payments-to"
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={handleFilterChange('to')}
            style={inputStyle}
          />
        </label>
      </form>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th scope="col">Organizador</th>
              <th scope="col">Monto</th>
              <th scope="col">Método</th>
              <th scope="col">Fecha</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={emptyCell}>Cargando pagos…</td>
              </tr>
            )}
            {!loading && payments.length === 0 && (
              <tr>
                <td colSpan={6} style={emptyCell}>No encontramos pagos con estos filtros.</td>
              </tr>
            )}
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.organizerName}</td>
                <td>{formatCurrency(payment.amount, payment.currency)}</td>
                <td>{payment.method}</td>
                <td>{new Date(payment.paidAt).toLocaleDateString()}</td>
                <td>
                  <span style={statusBadge(payment.status, payment.optimistic)}>
                    {statusLabel(payment.status)}
                    {payment.optimistic && ' · pendiente'}
                  </span>
                </td>
                <td>
                  {payment.status === 'failed' && payment.draft && (
                    <button
                      type="button"
                      onClick={() => onRetry(payment)}
                      style={ghostButton}
                    >
                      Reintentar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

function statusLabel(status: PaymentStatus) {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'failed':
      return 'Fallido';
    default:
      return 'Pagado';
  }
}

function statusBadge(status: PaymentStatus, optimistic?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    padding: '4px 8px',
    fontFamily: typography.body,
    fontSize: '0.75rem',
    backgroundColor: 'rgba(27, 153, 139, 0.18)',
    color: colors.success,
  };
  if (status === 'pending' || optimistic) {
    return { ...base, backgroundColor: 'rgba(255, 159, 28, 0.18)', color: colors.warning };
  }
  if (status === 'failed') {
    return { ...base, backgroundColor: 'rgba(239, 71, 111, 0.18)', color: colors.danger };
  }
  return base;
}

const filterGrid: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  alignItems: 'end',
};

const filterLabel: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const emptyCell: React.CSSProperties = {
  textAlign: 'center',
  padding: spacing.md,
  fontFamily: typography.body,
  color: colors.lightGray,
};
