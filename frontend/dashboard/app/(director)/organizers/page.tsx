'use client';

import React from 'react';
import { getDirectorOrganizers, OrganizerRecord } from '../../../lib/api/director';
import { colors, spacing, typography } from '../../../shared/theme';
import { OrganizerTable } from '../_components/OrganizerTable';
import { ActionsBar } from '../_components/ActionsBar';

export default function DirectorOrganizersPage() {
  const [query, setQuery] = React.useState('');
  const [organizers, setOrganizers] = React.useState<OrganizerRecord[]>([]);
  const [selected, setSelected] = React.useState<OrganizerRecord | undefined>();
  const [error, setError] = React.useState<string | null>(null);

  const loadOrganizers = React.useCallback(async () => {
    try {
      const data = await getDirectorOrganizers(query);
      setOrganizers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    }
  }, [query]);

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
        <label htmlFor="organizer-search" style={{ fontFamily: typography.body, color: colors.navy }}>
          <span style={visuallyHidden}>Buscar organizadores</span>
        </label>
        <input
          id="organizer-search"
          type="search"
          placeholder="Buscar organizadores"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar organizadores"
        />
        <button type="submit">Buscar</button>
      </form>
      {error && (
        <div role="alert" style={{ color: colors.danger, marginBottom: spacing.md }}>
          {error}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: spacing.lg }}>
        <OrganizerTable organizers={organizers} onSelect={setSelected} />
        <ActionsBar organizer={selected} onUpdated={loadOrganizers} />
      </div>
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: typography.title,
  color: colors.navy,
};

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
