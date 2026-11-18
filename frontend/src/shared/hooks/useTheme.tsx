/**
 * Tema claro u oscuro, elegido por quien usa el navegador.
 *
 * Se guarda en `localStorage` y no en la cuenta: es una comodidad de la pantalla,
 * como el sidebar plegado, no un ajuste que deba seguir al usuario a otro equipo.
 * Sin elección guardada se sigue al sistema operativo (`prefers-color-scheme`), y
 * cambia en vivo si el sistema cambia.
 *
 * La clase de `<html>` la pone primero un script en línea de `templates/app.html`,
 * antes de que cargue el CSS; esto solo la mantiene al día. La clave y la regla
 * tienen que ser las mismas en los dos sitios.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const THEME_KEY = 'netowl-tema';
/** La versión anterior escribía `dark` aquí sin que nadie lo eligiera; no vale como elección. */
const LEGACY_KEY = 'netowl-theme';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

function readPreference(): ThemePreference {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Sin almacenamiento (modo privado) se sigue al sistema.
  }
  return 'system';
}

function useSystemLight(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(LIGHT_QUERY);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => window.matchMedia(LIGHT_QUERY).matches,
    () => false,
  );
}

interface ThemeContextValue {
  /** Lo que eligió el usuario, `system` incluido. */
  preference: ThemePreference;
  /** El tema que se ve: la preferencia ya resuelta contra el sistema. */
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const systemLight = useSystemLight();
  const theme: Theme = preference === 'system' ? (systemLight ? 'light' : 'dark') : preference;

  // Antes de pintar, para que el cambio no muestre un cuadro a medio tema.
  useLayoutEffect(() => {
    const classes = document.documentElement.classList;
    classes.toggle('light', theme === 'light');
    classes.toggle('dark', theme === 'dark');
  }, [theme]);

  // Otra pestaña cambió el tema: se sigue, para no tener dos pestañas distintas.
  useEffect(() => {
    const onChangeValue = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setPreferenceState(readPreference());
    };
    window.addEventListener('storage', onChangeValue);
    return () => window.removeEventListener('storage', onChangeValue);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Sin almacenamiento el tema cambia igual, solo que no se recuerda.
    }
  }, []);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe usarse dentro de un ThemeProvider');
  }
  return context;
}
