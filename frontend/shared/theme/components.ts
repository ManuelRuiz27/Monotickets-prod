import type { CSSProperties } from 'react';

import { colors, typography, radii, shadows, spacing, motion } from './tokens';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonSize = 'sm' | 'md' | 'lg';

export const focusRing = `
  &:focus-visible {
    outline: 3px solid ${colors.sky};
    outline-offset: 3px;
  }
`;

export const srOnly = `
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export const buttonStyles: Record<Variant, string> = {
  primary: `
    background-color: ${colors.sky};
    color: ${colors.white};
    border: none;
    border-radius: ${radii.md};
    padding: ${spacing.sm} ${spacing.lg};
    font-family: ${typography.subtitle};
    font-weight: 600;
    box-shadow: ${shadows.sm};
    transition: transform 0.18s ${motion.easeOut}, box-shadow 0.18s ${motion.easeOut};
    ${focusRing}
    &:hover {
      transform: translateY(-1px);
      box-shadow: ${shadows.md};
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: ${shadows.sm};
    }
    @media (prefers-reduced-motion: reduce) {
      transition: none;
      &:hover {
        transform: none;
      }
    }
  `,
  secondary: `
    background-color: ${colors.white};
    color: ${colors.navy};
    border: 1px solid ${colors.sky};
    border-radius: ${radii.md};
    padding: ${spacing.sm} ${spacing.lg};
    font-family: ${typography.subtitle};
    font-weight: 600;
    box-shadow: ${shadows.sm};
    ${focusRing}
    &:hover {
      background-color: rgba(75, 163, 255, 0.08);
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,
  ghost: `
    background-color: transparent;
    color: ${colors.sky};
    border: none;
    border-radius: ${radii.md};
    padding: ${spacing.sm} ${spacing.md};
    font-family: ${typography.subtitle};
    font-weight: 600;
    ${focusRing}
    &:hover {
      background-color: rgba(13, 27, 42, 0.06);
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,
};

export const buttonSizeStyles: Record<ButtonSize, string> = {
  sm: `padding: ${spacing.xs} ${spacing.sm}; font-size: 0.875rem;`,
  md: `padding: ${spacing.sm} ${spacing.md}; font-size: 1rem;`,
  lg: `padding: ${spacing.md} ${spacing.lg}; font-size: 1.125rem;`,
};

export const cardStyles = `
  background-color: ${colors.white};
  border: 1px solid ${colors.neutral};
  border-radius: ${radii.lg};
  box-shadow: ${shadows.sm};
  padding: ${spacing.lg};
`;

export const inputStyles = `
  width: 100%;
  padding: ${spacing.sm} ${spacing.md};
  border: 1px solid ${colors.lightGray};
  border-radius: ${radii.md};
  font-family: ${typography.body};
  font-size: 1rem;
  line-height: 1.5;
  color: ${colors.navy};
  transition: border-color 0.2s ${motion.easeOut}, box-shadow 0.2s ${motion.easeOut};
  background-color: ${colors.white};
  ${focusRing}
  &:focus {
    border-color: ${colors.sky};
    box-shadow: 0 0 0 3px rgba(75, 163, 255, 0.25);
  }
  &:disabled {
    background-color: ${colors.neutral};
    color: ${colors.lightGray};
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const tabStyles = {
  list: `
    display: flex;
    gap: ${spacing.sm};
    border-bottom: 2px solid ${colors.neutral};
    margin-bottom: ${spacing.md};
    padding: 0;
  `,
  trigger: `
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    padding: ${spacing.sm} ${spacing.md};
    font-family: ${typography.subtitle};
    font-weight: 600;
    color: ${colors.lightGray};
    cursor: pointer;
    ${focusRing}
  `,
  triggerActive: `
    color: ${colors.navy};
    border-color: ${colors.sky};
  `,
  panel: `
    padding-top: ${spacing.sm};
  `,
};

export const tableStyles = `
  width: 100%;
  border-collapse: collapse;
  font-family: ${typography.body};
  color: ${colors.navy};
  th,
  td {
    padding: ${spacing.sm};
    border-bottom: 1px solid ${colors.neutral};
    text-align: left;
  }
  th {
    font-family: ${typography.subtitle};
    font-weight: 600;
    color: ${colors.navy};
  }
  tbody tr:hover {
    background-color: rgba(13, 27, 42, 0.04);
  }
`;

export const dialogStyles = {
  overlay: `
    position: fixed;
    inset: 0;
    background: rgba(13, 27, 42, 0.45);
    display: grid;
    place-items: center;
    z-index: 40;
  `,
  content: `
    background: ${colors.white};
    border-radius: ${radii.lg};
    box-shadow: ${shadows.lg};
    width: min(600px, 90vw);
    max-height: 90vh;
    overflow: auto;
    padding: ${spacing.lg};
  `,
  header: `
    margin-bottom: ${spacing.md};
  `,
  footer: `
    display: flex;
    justify-content: flex-end;
    gap: ${spacing.sm};
    margin-top: ${spacing.lg};
  `,
};

export function parseStyles(inline: string): CSSProperties {
  return inline.split(';').reduce<CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
