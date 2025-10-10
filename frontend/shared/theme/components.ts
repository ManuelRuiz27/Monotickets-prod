import { colors, typography, radii, shadows, spacing, motion } from './tokens';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonSize = 'sm' | 'md' | 'lg';

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
  `,
  ghost: `
    background-color: transparent;
    color: ${colors.sky};
    border: none;
    border-radius: ${radii.md};
    padding: ${spacing.sm} ${spacing.md};
    font-family: ${typography.subtitle};
    font-weight: 600;
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
  transition: border-color 0.2s ${motion.easeOut}, box-shadow 0.2s ${motion.easeOut};
  &:focus {
    outline: 3px solid ${colors.sky};
    outline-offset: 2px;
    border-color: ${colors.sky};
    box-shadow: 0 0 0 2px rgba(75, 163, 255, 0.2);
  }
`;

export const tabStyles = {
  list: `
    display: flex;
    gap: ${spacing.sm};
    border-bottom: 2px solid ${colors.neutral};
    margin-bottom: ${spacing.md};
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
  `,
  triggerActive: `
    color: ${colors.navy};
    border-color: ${colors.sky};
  `,
};

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
