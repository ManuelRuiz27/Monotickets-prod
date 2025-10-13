import React from 'react';
import { spacing, typography, colors } from '@shared/theme';

export default function OrganizerLoading() {
  return (
    <div role="status" aria-live="polite" style={{ padding: spacing.xl }}>
      <p style={{ fontFamily: typography.body, color: colors.navy }}>Cargando panel del organizador…</p>
    </div>
  );
}
