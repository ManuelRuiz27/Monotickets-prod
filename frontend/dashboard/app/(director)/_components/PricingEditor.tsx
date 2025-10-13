'use client';

import React from 'react';
import type { OrganizerRecord } from '@/lib/api/director';
import { spacing, typography, colors, inputStyles, buttonStyles, cardStyles, parseStyles } from '@shared/theme';

interface PricingEditorProps {
  organizers: OrganizerRecord[];
  loading?: boolean;
  savingPricing?: string | null;
  grantingTickets?: string | null;
  onUpdatePricing: (organizerId: string, price: number, currency: string) => void;
  onGrantTickets: (organizerId: string, type: 'prepaid' | 'loan', tickets: number) => void;
}

interface RowState {
  price: string;
  tickets: string;
  type: 'prepaid' | 'loan';
}

const inputStyle = parseStyles(inputStyles);
const primaryButton = parseStyles(buttonStyles.primary);
const secondaryButton = parseStyles(buttonStyles.secondary);
const cardStyle = parseStyles(cardStyles);

export function PricingEditor({
  organizers,
  loading,
  savingPricing,
  grantingTickets,
  onUpdatePricing,
  onGrantTickets,
}: PricingEditorProps) {
  const [rows, setRows] = React.useState<Record<string, RowState>>({});

  React.useEffect(() => {
    setRows((current) => {
      const updated: Record<string, RowState> = { ...current };
      organizers.forEach((organizer) => {
        if (!updated[organizer.id]) {
          updated[organizer.id] = {
            price: organizer.pricePerTicket ? String(organizer.pricePerTicket) : '',
            tickets: '',
            type: 'prepaid',
          };
        }
      });
      return updated;
    });
  }, [organizers]);

  const handleRowChange = (id: string, partial: Partial<RowState>) => {
    setRows((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...partial,
      },
    }));
  };

  return (
    <section aria-live="polite" style={{ display: 'grid', gap: spacing.md }}>
      <h2 style={titleStyle}>Gestión de precios y créditos</h2>
      <p style={helperStyle}>
        Ajusta el precio por ticket y otorga créditos en caso de prepago o préstamo. Los cambios impactan el cálculo de deuda.
      </p>
      {loading && <p style={helperStyle}>Cargando organizadores…</p>}
      {!loading && organizers.length === 0 && <p style={helperStyle}>No hay organizadores disponibles.</p>}
      {!loading &&
        organizers.map((organizer) => {
          const row = rows[organizer.id] ?? { price: '', tickets: '', type: 'prepaid' };
          return (
            <article key={organizer.id} style={cardStyle}>
              <header style={cardHeader}>
                <div>
                  <h3 style={organizerName}>{organizer.name}</h3>
                  <p style={helperStyle}>{organizer.plan} · {organizer.email}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={balanceStyle}>{formatCurrency(organizer.outstandingBalance, organizer.currency)}</p>
                  <p style={helperStyle}>Balance pendiente</p>
                </div>
              </header>
              <div style={inputsGrid}>
                <label style={labelStyle} htmlFor={`price-${organizer.id}`}>
                  Precio por ticket ({organizer.currency})
                  <input
                    id={`price-${organizer.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.price}
                    onChange={(event) => handleRowChange(organizer.id, { price: event.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle} htmlFor={`tickets-${organizer.id}`}>
                  Tickets a otorgar
                  <input
                    id={`tickets-${organizer.id}`}
                    type="number"
                    min="0"
                    step="1"
                    value={row.tickets}
                    onChange={(event) => handleRowChange(organizer.id, { tickets: event.target.value })}
                    style={inputStyle}
                    placeholder="0"
                  />
                </label>
                <label style={labelStyle} htmlFor={`type-${organizer.id}`}>
                  Tipo de crédito
                  <select
                    id={`type-${organizer.id}`}
                    value={row.type}
                    onChange={(event) => handleRowChange(organizer.id, { type: event.target.value as RowState['type'] })}
                    style={{ ...inputStyle, appearance: 'auto' }}
                  >
                    <option value="prepaid">Prepago</option>
                    <option value="loan">Préstamo</option>
                  </select>
                </label>
              </div>
              <div style={actionsStyle}>
                <button
                  type="button"
                  onClick={() => onUpdatePricing(organizer.id, Number(row.price || organizer.pricePerTicket || 0), organizer.currency)}
                  style={secondaryButton}
                  disabled={savingPricing === organizer.id}
                >
                  {savingPricing === organizer.id ? 'Guardando…' : 'Guardar precio'}
                </button>
                <button
                  type="button"
                  onClick={() => onGrantTickets(organizer.id, row.type, Number(row.tickets || 0))}
                  style={primaryButton}
                  disabled={grantingTickets === organizer.id || !row.tickets}
                >
                  {grantingTickets === organizer.id ? 'Otorgando…' : 'Otorgar tickets'}
                </button>
              </div>
            </article>
          );
        })}
    </section>
  );
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value);
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

const cardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: spacing.md,
  flexWrap: 'wrap',
  marginBottom: spacing.md,
};

const organizerName: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
  margin: 0,
};

const balanceStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  fontSize: '1.2rem',
  color: colors.navy,
  margin: 0,
};

const inputsGrid: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  marginBottom: spacing.md,
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing.sm,
  justifyContent: 'flex-end',
};
