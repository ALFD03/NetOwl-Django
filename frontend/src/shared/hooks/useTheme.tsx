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

export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';
export type Tema = 'claro' | 'oscuro';

const CLAVE_TEMA = 'netowl-tema';
/** La versión anterior escribía `dark` aquí sin que nadie lo eligiera; no vale como elección. */
const CLAVE_ANTIGUA = 'netowl-theme';
const CONSULTA_CLARO = '(prefers-color-scheme: light)';

function leerPreferencia(): PreferenciaTema {
  try {
    localStorage.removeItem(CLAVE_ANTIGUA);
    const guardada = localStorage.getItem(CLAVE_TEMA);
    if (guardada === 'claro' || guardada === 'oscuro') return guardada;
  } catch {
    // Sin almacenamiento (modo privado) se sigue al sistema.
  }
  return 'sistema';
}

function useSistemaClaro(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mql = window.matchMedia(CONSULTA_CLARO);
      mql.addEventListener('change', avisar);
      return () => mql.removeEventListener('change', avisar);
    },
    () => window.matchMedia(CONSULTA_CLARO).matches,
    () => false,
  );
}

interface ThemeContextValue {
  /** Lo que eligió el usuario, `sistema` incluido. */
  preferencia: PreferenciaTema;
  /** El tema que se ve: la preferencia ya resuelta contra el sistema. */
  tema: Tema;
  setPreferencia: (preferencia: PreferenciaTema) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferencia, setPreferenciaState] = useState(leerPreferencia);
  const sistemaClaro = useSistemaClaro();
  const tema: Tema = preferencia === 'sistema' ? (sistemaClaro ? 'claro' : 'oscuro') : preferencia;

  // Antes de pintar, para que el cambio no muestre un cuadro a medio tema.
  useLayoutEffect(() => {
    const clases = document.documentElement.classList;
    clases.toggle('light', tema === 'claro');
    clases.toggle('dark', tema === 'oscuro');
  }, [tema]);

  // Otra pestaña cambió el tema: se sigue, para no tener dos pestañas distintas.
  useEffect(() => {
    const alCambiar = (evento: StorageEvent) => {
      if (evento.key === CLAVE_TEMA || evento.key === null) setPreferenciaState(leerPreferencia());
    };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, []);

  const setPreferencia = useCallback((nueva: PreferenciaTema) => {
    setPreferenciaState(nueva);
    try {
      if (nueva === 'sistema') localStorage.removeItem(CLAVE_TEMA);
      else localStorage.setItem(CLAVE_TEMA, nueva);
    } catch {
      // Sin almacenamiento el tema cambia igual, solo que no se recuerda.
    }
  }, []);

  const valor = useMemo(() => ({ preferencia, tema, setPreferencia }), [preferencia, tema, setPreferencia]);

  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const contexto = useContext(ThemeContext);
  if (!contexto) {
    throw new Error('useTheme debe usarse dentro de un ThemeProvider');
  }
  return contexto;
}
