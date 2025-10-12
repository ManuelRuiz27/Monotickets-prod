import type React from 'react';
import type { EventTheme } from '../api/guest';

export interface ThemeOverrides {
  '--guest-color-primary': string;
  '--guest-color-secondary': string;
  '--guest-color-background': string;
  '--guest-color-text': string;
  '--guest-color-accent': string;
  '--guest-font-heading': string;
  '--guest-font-body': string;
}

const FALLBACKS: ThemeOverrides = {
  '--guest-color-primary': '#4BA3FF',
  '--guest-color-secondary': '#0D1B2A',
  '--guest-color-background': '#FFFFFF',
  '--guest-color-text': '#0D1B2A',
  '--guest-color-accent': '#FF9F1C',
  '--guest-font-heading': `'Poppins', system-ui, sans-serif`,
  '--guest-font-body': `'Inter', 'Roboto', system-ui, sans-serif`,
};

export function resolveThemeOverrides(theme?: EventTheme): ThemeOverrides {
  if (!theme) {
    return FALLBACKS;
  }

  return {
    '--guest-color-primary': theme.primaryColor ?? FALLBACKS['--guest-color-primary'],
    '--guest-color-secondary': theme.secondaryColor ?? FALLBACKS['--guest-color-secondary'],
    '--guest-color-background': theme.backgroundColor ?? FALLBACKS['--guest-color-background'],
    '--guest-color-text': theme.textColor ?? FALLBACKS['--guest-color-text'],
    '--guest-color-accent': theme.accentColor ?? theme.primaryColor ?? FALLBACKS['--guest-color-accent'],
    '--guest-font-heading': theme.headingFont ?? FALLBACKS['--guest-font-heading'],
    '--guest-font-body': theme.bodyFont ?? FALLBACKS['--guest-font-body'],
  };
}

export function themeToStyle(theme?: EventTheme): React.CSSProperties {
  const overrides = resolveThemeOverrides(theme);
  return Object.entries(overrides).reduce<React.CSSProperties>((acc, [key, value]) => {
    return { ...acc, [key as keyof ThemeOverrides]: value };
  }, {});
}

export function withThemeClassName(className?: string) {
  return ['guest-theme-surface', className].filter(Boolean).join(' ');
}
