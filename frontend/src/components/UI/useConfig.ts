import { useMemo } from 'react';
import { DEFAULT_UI_CONFIG, type UIConfig } from './config';

// Simple hook to centralize UI configuration; can be extended to use Context later
export function useUIConfig(overrides?: Partial<UIConfig>) {
  const cfg = useMemo(() => ({ ...DEFAULT_UI_CONFIG, ...overrides }), [overrides]);
  return cfg;
}
