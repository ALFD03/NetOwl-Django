/**
 * Los datos de la página actual, servidos por su endpoint de `/api/`.
 *
 * Los monta `app/apiPage.tsx`; los componentes de varios niveles más abajo
 * (objetivos, permisos de catálogo…) los leen con `usePageProps()`. Se
 * refrescan solos tras cualquier escritura (`shared/lib/api/client.ts`).
 */

import { createContext, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

export const PageDataContext = createContext<Record<string, unknown>>({});

/** Los datos de la página, con la forma que devuelve su endpoint. */
export function usePageProps<T = Record<string, unknown>>(): T {
  return useContext(PageDataContext) as T;
}

/** Estado de navegación que pide volver a montar la página con datos frescos. */
export interface VisitState {
  remount?: number;
}

type QueryValue = string | number | null | undefined;

/**
 * Cambia los parámetros de la URL de la página actual: la página vuelve a pedir
 * sus datos y conserva su estado. `path` cambia además de ruta.
 *
 * `remount` la monta de nuevo, sin el estado anterior, cuando lleguen los datos
 * frescos: para cambiar de periodo o volver tras borrar el que se veía.
 */
export function useVisit() {
  const navigate = useNavigate();
  return useCallback(
    (params: Record<string, QueryValue>, options: { path?: string; replace?: boolean; remount?: boolean } = {}) => {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
      });
      const query = search.toString();
      navigate(`${options.path ?? window.location.pathname}${query ? `?${query}` : ''}`, {
        replace: options.replace,
        preventScrollReset: true,
        state: options.remount ? ({ remount: Date.now() } satisfies VisitState) : undefined,
      });
    },
    [navigate],
  );
}
