'use client';

import React from 'react';
import type { EventStatus, LandingKind } from '@/lib/api/organizer';
import { spacing, typography, colors, inputStyles, buttonStyles, parseStyles } from '@shared/theme';

export interface OrganizerFilters {
  search: string;
  status: 'all' | EventStatus;
  type: 'all' | LandingKind;
  from?: string;
  to?: string;
}

interface FiltersProps {
  value: OrganizerFilters;
  onChange: (filters: OrganizerFilters) => void;
  onReset?: () => void;
}

const inputStyle = parseStyles(inputStyles);
const ghostButton = parseStyles(buttonStyles.ghost);

export function Filters({ value, onChange, onReset }: FiltersProps) {
  const handleChange = React.useCallback(
    (partial: Partial<OrganizerFilters>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value]
  );

  return (
    <form
      aria-label="Filtros del panel de organizador"
      onSubmit={(event) => event.preventDefault()}
      style={{ display: 'grid', gap: spacing.md }}
    >
      <div style={gridStyle}>
        <label htmlFor="filter-search" style={labelStyle}>
          Búsqueda
          <input
            id="filter-search"
            type="search"
            value={value.search}
            onChange={(event) => handleChange({ search: event.target.value })}
            style={inputStyle}
            placeholder="Nombre, locación o invitado"
          />
        </label>
        <label htmlFor="filter-type" style={labelStyle}>
          Tipo de evento
          <select
            id="filter-type"
            value={value.type}
            onChange={(event) => handleChange({ type: event.target.value as OrganizerFilters['type'] })}
            style={{ ...inputStyle, appearance: 'auto' }}
          >
            <option value="all">Todos</option>
            <option value="standard">Estándar</option>
            <option value="premium">Premium</option>
          </select>
        </label>
        <label htmlFor="filter-status" style={labelStyle}>
          Estado
          <select
            id="filter-status"
            value={value.status}
            onChange={(event) => handleChange({ status: event.target.value as OrganizerFilters['status'] })}
            style={{ ...inputStyle, appearance: 'auto' }}
          >
            <option value="all">Todos</option>
            <option value="draft">Borrador</option>
            <option value="live">Previo / en vivo</option>
            <option value="completed">Finalizado</option>
          </select>
        </label>
      </div>
      <fieldset style={dateFieldsetStyle}>
        <legend style={legendStyle}>Rango de fechas</legend>
        <div style={dateGridStyle}>
          <label htmlFor="filter-from" style={labelStyle}>
            Desde
            <input
              id="filter-from"
              type="date"
              value={value.from ?? ''}
              onChange={(event) => handleChange({ from: event.target.value || undefined })}
              style={inputStyle}
            />
          </label>
          <label htmlFor="filter-to" style={labelStyle}>
            Hasta
            <input
              id="filter-to"
              type="date"
              value={value.to ?? ''}
              min={value.from ?? undefined}
              onChange={(event) => handleChange({ to: event.target.value || undefined })}
              style={inputStyle}
            />
          </label>
        </div>
      </fieldset>
      <div style={actionsStyle}>
        <button
          type="button"
          onClick={() => onReset?.()}
          style={{ ...ghostButton, alignSelf: 'flex-start' }}
        >
          Limpiar filtros
        </button>
        <span style={hintStyle}>Los resultados se actualizan automáticamente al ajustar los filtros.</span>
      </div>
    </form>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  alignItems: 'end',
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: spacing.md,
  flexWrap: 'wrap',
  alignItems: 'center',
};

const hintStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
};

const dateFieldsetStyle: React.CSSProperties = {
  border: `1px solid ${colors.neutral}`,
  borderRadius: '12px',
  padding: spacing.md,
  display: 'grid',
  gap: spacing.sm,
};

const legendStyle: React.CSSProperties = {
  fontFamily: typography.subtitle,
  color: colors.navy,
};

const dateGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.md,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
};
