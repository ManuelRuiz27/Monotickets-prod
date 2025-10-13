'use client';

import React from 'react';
import { getDirectorOrganizers, OrganizerRecord } from '@/lib/api/director';
import { colors, spacing, typography, cardStyles } from '@shared/theme';
import { OrganizerActions } from '../_components/OrganizerActions';

const cardStyle = parseStyles(cardStyles);

export default function DirectorOrganizersPage() {
  const [query, setQuery] = React.useState('');
  const [organizers, setOrganizers] = React.useState<OrganizerRecord[]>([]);
  const [selected, setSelected] = React.useState<OrganizerRecord | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadOrganizers = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDirectorOrganizers(query);
      setOrganizers(data);
      setError(null);
      if (selected) {
        const refreshed = data.find((item) => item.id === selected.id);
        setSelected(refreshed ?? undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado al cargar organizadores');
    } finally {
      setLoading(false);
    }
  }, [query, selected?.id]);

  React.useEffect(() => {
    loadOrganizers();
  }, [loadOrganizers]);

  return (
    <main aria-labelledby="director-organizers-title" style={{ padding: spacing.xl }}>
      <h1 id="director-organizers-title" style={titleStyle}>
        Organizadores
      </h1>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          loadOrganizers();
        }}
        style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.lg }}
      >
        <label htmlFor="organizer-search" style={labelStyle}>
          <span style={visuallyHidden}>Buscar organizadores</span>
        </label>
        <input
          id="organizer-search"
          type="search"
          placeholder="Buscar por nombre o correo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={inputStyle}
          aria-label="Buscar organizadores"
        />
        <button type="submit" style={buttonStyle}>
          Buscar
        </button>
      </form>
      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}
      <div style={{ display: 'grid', gap: spacing.lg, gridTemplateColumns: '2fr 1fr' }}>
        <section style={{ ...cardStyle, padding: 0 }} aria-live="polite">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th scope="col">Organizador</th>
                <th scope="col">Plan</th>
                <th scope="col">Tickets</th>
                <th scope="col">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={emptyCellStyle}>
                    Cargando organizadores…
                  </td>
                </tr>
              )}
              {!loading && organizers.length === 0 && (
                <tr>
                  <td colSpan={4} style={emptyCellStyle}>
                    No encontramos organizadores con ese criterio.
                  </td>
                </tr>
              )}
              {organizers.map((organizer) => {
                const isSelected = organizer.id === selected?.id;
                return (
                  <tr
                    key={organizer.id}
                    onClick={() => setSelected(organizer)}
                    aria-selected={isSelected}
                    style={{ cursor: 'pointer', backgroundColor: isSelected ? 'rgba(75, 163, 255, 0.08)' : undefined }}
                  >
                    <td>
                      <div style={nameCellStyle}>
                        <span>{organizer.name}</span>
                        <small style={helperStyle}>{organizer.email}</small>
                      </div>
                    </td>
                    <td>{organizer.plan}</td>
                    <td>{organizer.ticketsGenerated.toLocaleString()}</td>
                    <td>
                      {organizer.outstandingBalance.toLocaleString(undefined, {
                        style: 'currency',
                        currency: organizer.currency,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <OrganizerActions organizer={selected} onUpdated={loadOrganizers} />
      </div>
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
};

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  clip: 'rect(0 0 0 0)',
  height: 1,
  width: 1,
  overflow: 'hidden',
};

const visuallyHidden = labelStyle;

const inputStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: '12px',
  border: `1px solid ${colors.neutral}`,
  fontFamily: typography.body,
  minWidth: '260px',
};

const buttonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: '12px',
  border: `1px solid ${colors.sky}`,
  backgroundColor: colors.sky,
  color: colors.white,
  fontFamily: typography.subtitle,
};

const alertStyle: React.CSSProperties = {
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
