/**
 * Rutas de la SPA. Cada ruta nueva necesita también su vista `spa_shell` en Django.
 * Lo que no esté aquí sigue en Inertia y se abre con recarga completa.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
});

/** La URL con la que Django sirvió la SPA: si no tiene ruta aquí, no hay página. */
const INITIAL_PATH = window.location.pathname;

function LegacyPage() {
  const { pathname, search } = useLocation();
  const servedHere = pathname === INITIAL_PATH;
  useEffect(() => {
    if (!servedHere) window.location.assign(pathname + search);
  }, [pathname, search, servedHere]);
  return servedHere ? <p className="p-8 text-center text-slate-400">Página no encontrada.</p> : null;
}

export const routes: RouteObject[] = [
  { path: '/auth/login/', lazy: page(() => import('@/pages/Config/Login')) },
  { path: '*', element: <LegacyPage /> },
];
