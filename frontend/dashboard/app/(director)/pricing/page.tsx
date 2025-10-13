'use client';

import React from 'react';
import {
  getDirectorOrganizers,
  updatePricing,
  grantTickets,
  type OrganizerRecord,
} from '@/lib/api/director';
import { spacing, typography, colors } from '@shared/theme';
import { PricingEditor } from '../_components/PricingEditor';

export default function PricingPage() {
  const [organizers, setOrganizers] = React.useState<OrganizerRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [savingPricing, setSavingPricing] = React.useState<string | null>(null);
  const [grantingTickets, setGrantingTickets] = React.useState<string | null>(null);

  const loadOrganizers = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDirectorOrganizers();
      setOrganizers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los organizadores.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadOrganizers();
  }, [loadOrganizers]);

  const handleUpdatePricing = async (organizerId: string, price: number, currency: string) => {
    if (price <= 0) {
      setStatus('Ingresa un precio mayor a cero.');
      return;
    }
    setSavingPricing(organizerId);
    setStatus(null);
    try {
      await updatePricing(organizerId, { price, currency });
      setStatus('Precio actualizado correctamente.');
      loadOrganizers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el precio.';
      setStatus(message);
    } finally {
      setSavingPricing(null);
    }
  };

  const handleGrantTickets = async (organizerId: string, type: 'prepaid' | 'loan', tickets: number) => {
    if (tickets <= 0) {
      setStatus('Ingresa un número de tickets válido.');
      return;
    }
    setGrantingTickets(organizerId);
    setStatus(null);
    try {
      await grantTickets(organizerId, { type, tickets });
      setStatus('Tickets otorgados correctamente.');
      loadOrganizers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron otorgar los tickets.';
      setStatus(message);
    } finally {
      setGrantingTickets(null);
    }
  };

  return (
    <main aria-labelledby="pricing-title" style={{ padding: spacing.xl }}>
      <header style={headerStyle}>
        <div>
          <h1 id="pricing-title" style={titleStyle}>
            Gestión de precios
          </h1>
          <p style={subtitleStyle}>
            Define el precio por ticket para cada organizador y asigna créditos cuando sea necesario.
          </p>
        </div>
        <button type="button" onClick={loadOrganizers} style={refreshButtonStyle}>
          Actualizar listado
        </button>
      </header>
      {error && (
        <div role="alert" style={errorBanner}>
          {error}
        </div>
      )}
      <PricingEditor
        organizers={organizers}
        loading={loading}
        savingPricing={savingPricing}
        grantingTickets={grantingTickets}
        onUpdatePricing={handleUpdatePricing}
        onGrantTickets={handleGrantTickets}
      />
      <div aria-live="polite" style={{ minHeight: '1.5rem', marginTop: spacing.md }}>
        {status && <p style={statusStyle}>{status}</p>}
      </div>
    </main>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
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

const refreshButtonStyle: React.CSSProperties = {
  border: `1px solid ${colors.sky}`,
  padding: `${spacing.xs} ${spacing.sm}`,
  borderRadius: '12px',
  backgroundColor: 'transparent',
  color: colors.sky,
  fontFamily: typography.subtitle,
};

const errorBanner: React.CSSProperties = {
  marginBottom: spacing.md,
  padding: spacing.md,
  borderRadius: '12px',
  backgroundColor: 'rgba(239, 71, 111, 0.12)',
  color: colors.danger,
  fontFamily: typography.body,
};

const statusStyle: React.CSSProperties = {
  fontFamily: typography.body,
  color: colors.navy,
};
