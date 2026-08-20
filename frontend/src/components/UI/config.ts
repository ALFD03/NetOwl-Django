import type { NeonTheme, ButtonVariant, Size } from './types';

export const DEFAULT_UI_CONFIG = {
  button: {
    variant: 'primary' as ButtonVariant,
    size: 'md' as Size,
  },
  modal: {
    size: 'xl' as Size,
    theme: 'slate' as NeonTheme,
  },
  card: {
    defaultTheme: 'slate' as NeonTheme,
  },
};

export type UIConfig = typeof DEFAULT_UI_CONFIG;
