'use client';

import React from 'react';
import { getReceivables, ReceivableRecord } from '../../../lib/api/director';
import { colors, spacing, typography, cardStyles } from '../../../shared/theme';

const cardStyle = parseStyles(cardStyles);

export default function ReceivablesPage() {
  const [aging, setAging] = React.useState<ReceivableRecord['agingBucket'] | 'all'>('all');
  const [receivables, setReceivables] = React.useState<ReceivableRecord[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadReceivables = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReceivables(aging === 'all' ? undefined : aging);
      setReceivables(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cartera');
    } finally {
      setLoading(false);
    }
  }, [aging]);

  React.useEffect(() => {
    loadReceivables();
  }, [loadReceivables]);

  return (
    <main aria-labelledby="receivables-title" style={{ padding: spacing.xl }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <div>
          <h1 id="receivables-title" style={titleStyle}>
            Cuentas por cobrar
          </h1>
          <p style={subtitleStyle}>Controla la deuda abierta por organizador y revisa los movimientos recientes.</p>
        </div>
        <label htmlFor="aging-filter" style={filterLabelStyle}>
          Antigüedad
          <select
            id="aging-filter"
            value={aging}
            onChange={(event) => setAging(event.target.value as ReceivableRecord['agingBucket'] | 'all')}
            style={selectStyle}
          >
            <option value="all">Todas</option>
            <option value="0-30">0-30 días</option>
            <option value="31-60">31-60 días</option>
            <option value="61-90">61-90 días</option>
            <option value="90+">90+ días</option>
          </select>
        </label>
      </header>
      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}
      <section style={{ ...cardStyle, padding: 0 }} aria-live="polite">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th scope="col">Organizador</th>
              <th scope="col">Monto</th>
              <th scope="col">Antigüedad</th>
              <th scope="col">Último movimiento</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} style={emptyCellStyle}>
                  Cargando cartera…
                </td>
              </tr>
            )}
            {!loading && receivables.length === 0 && (
              <tr>
                <td colSpan={4} style={emptyCellStyle}>
                  No hay cuentas por cobrar para el filtro seleccionado.
                </td>
              </tr>
            )}
            {receivables.map((item) => (
              <tr key={item.organizerId}>
                <td>
                  <div style={nameCellStyle}>
                    <span>{item.organizerName}</span>
                    {item.lastMovementNote && <small style={helperStyle}>{item.lastMovementNote}</small>}
                  </div>
                </td>
                <td>
                  {item.amount.toLocaleString(undefined, { style: 'currency', currency: item.currency })}
                </td>
                <td>{renderAgingLabel(item.agingBucket)}</td>
                <td>{item.lastPaymentAt ? new Date(item.lastPaymentAt).toLocaleDateString() : 'Sin registro'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function renderAgingLabel(value: ReceivableRecord['agingBucket']) {
  switch (value) {
    case '0-30':
      return '0-30 días';
    case '31-60':
      return '31-60 días';
    case '61-90':
      return '61-90 días';
    case '90+':
      return 'Más de 90 días';
    default:
      return value;
  }
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.lightGray,
};

const filterLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
  fontFamily: typography.body,
  color: colors.navy,
};

const selectStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: '12px',
  border: `1px solid ${colors.neutral}`,
  fontFamily: typography.body,
};

const alertStyle: React.CSSProperties = {
  marginTop: spacing.md,
  marginBottom: spacing.md,
  padding: spacing.md,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.1)',
  color: colors.danger,
  fontFamily: typography.body,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: typography.body,
};

const emptyCellStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: spacing.md,
};

const nameCellStyle: React.CSSProperties = {
  display: 'grid',
  gap: spacing.xs,
};

const helperStyle: React.CSSProperties = {
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
