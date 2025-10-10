'use client';

import React from 'react';
import { getDirectorOverview, KpiOverview } from '../../../lib/api/director';
import { colors, spacing, typography, cardStyles } from '../../../shared/theme';
import { KpiCards } from '../_components/KpiCards';

const cardStyle = parseStyles(cardStyles);

export default function DirectorOverviewPage() {
  const [overview, setOverview] = React.useState<KpiOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getDirectorOverview()
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main aria-labelledby="director-overview-title" style={{ padding: spacing.xl }}>
      <h1 id="director-overview-title" style={titleStyle}>
        Panel del director
      </h1>
      {error && (
        <div role="alert" style={{ color: colors.danger, marginBottom: spacing.md }}>
          No se pudieron cargar los indicadores. {error}
        </div>
      )}
      {loading && <p>Cargando métricas…</p>}
      <KpiCards overview={overview ?? undefined} />
      <section style={{ ...cardStyle, marginTop: spacing.lg }}>
        <h2 style={sectionTitle}>Top organizadores</h2>
        <ol>
          {overview?.topOrganizers?.map((org) => (
            <li key={org.id} style={{ fontFamily: typography.body }}>
              {org.name} — {org.tickets} tickets
            </li>
          )) ?? <li>No hay datos disponibles.</li>}
        </ol>
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

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
