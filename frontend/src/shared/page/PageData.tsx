/**
 * Los datos de la página actual, servidos por su endpoint de `/api/`.
 *
 * Los monta `app/apiPage.tsx`; los componentes de varios niveles más abajo
 * (objetivos, permisos de catálogo…) los leen con `usePageProps()`.
 */

import { createContext, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

export interface PageData {
  props: Record<string, unknown>;
  /** Vuelve a pedir los datos de la página (tras guardar algo). */
  reload: () => Promise<void>;
}

export const PageDataContext = createContext<PageData>({
  props: {},
  reload: async () => {},
});

/** Los datos de la página, con la forma que devuelve su endpoint. */
export function usePageProps<T = Record<string, unknown>>(): T {
  return useContext(PageDataContext).props as T;
}

export function useReloadPage(): () => Promise<void> {
  return useContext(PageDataContext).reload;
}

type QueryValue = string | number | null | undefined;

/**
 * Cambia los parámetros de la URL de la página actual: la página vuelve a pedir
 * sus datos y conserva su estado. `path` cambia además de ruta.
 */
export function useVisit() {
  const navigate = useNavigate();
  return useCallback(
    (params: Record<string, QueryValue>, options: { path?: string; replace?: boolean } = {}) => {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
      });
      const query = search.toString();
      navigate(`${options.path ?? window.location.pathname}${query ? `?${query}` : ''}`, {
        replace: options.replace,
        preventScrollReset: true,
      });
    },
    [navigate],
  );
}
