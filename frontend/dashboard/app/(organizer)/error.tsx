'use client';

import React from 'react';
import { spacing, typography, colors } from '../../shared/theme';

interface ErrorPageProps {
  error: Error;
  reset: () => void;
}

export default function OrganizerError({ error, reset }: ErrorPageProps) {
  return (
    <div role="alert" style={{ padding: spacing.xl }}>
      <h1 style={{ fontFamily: typography.title, color: colors.danger }}>Algo salió mal</h1>
      <p style={{ fontFamily: typography.body, color: colors.navy }}>{error.message}</p>
      <button type="button" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
