/**
 * Rutas de la SPA: cada página con el endpoint de `/api/` que le da sus datos.
 *
 * Cada ruta necesita también su vista `page()` en Django, que la protege y
 * sirve el armazón al cargarla directamente.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';

import { LoadingState } from '@/shared/ui';

import { apiPage, page } from './apiPage';

/** La URL con la que Django sirvió la SPA: si no tiene ruta aquí, no hay página. */
const INITIAL_PATH = window.location.pathname;

/**
 * Lo que no es una página de la SPA (`/`, la raíz de un módulo, que redirige a
 * su primera página permitida) lo resuelve Django con una carga completa.
 */
function ServerRoute() {
  const { pathname, search } = useLocation();
  const servedHere = pathname === INITIAL_PATH;
  useEffect(() => {
    if (!servedHere) window.location.assign(pathname + search);
  }, [pathname, search, servedHere]);
  return servedHere ? <p className="p-8 text-center text-slate-400">Página no encontrada.</p> : null;
}

const pages: RouteObject[] = [
  { path: '/auth/login/', lazy: page(() => import('@/pages/Config/Login')) },
  { path: '/auth/users/', lazy: apiPage('/api/auth/users/', () => import('@/pages/Config/Management')) },
  { path: '/auth/tokens/', lazy: page(() => import('@/pages/Config/Tokens')) },

  { path: '/subscriptions/dashboard/', lazy: apiPage('/api/subscriptions/dashboard/', () => import('@/pages/Subscriptions/Dashboard')) },
  { path: '/subscriptions/analytics/', lazy: apiPage('/api/subscriptions/analytics/', () => import('@/pages/Subscriptions/Analytics')) },
  { path: '/subscriptions/results/', lazy: apiPage('/api/subscriptions/results/', () => import('@/pages/Subscriptions/Results')) },
  { path: '/subscriptions/results/:period/', lazy: apiPage('/api/subscriptions/results/', () => import('@/pages/Subscriptions/Results')) },
  { path: '/subscriptions/lifetime/', lazy: apiPage('/api/subscriptions/lifetime/', () => import('@/pages/Subscriptions/Lifetime')) },
  { path: '/subscriptions/sales-report/', lazy: apiPage('/api/subscriptions/sales-report/', () => import('@/pages/Subscriptions/SalesReport')) },
  { path: '/subscriptions/business-units/', lazy: apiPage('/api/subscriptions/business-units/', () => import('@/pages/Subscriptions/BusinessUnits')) },
  { path: '/subscriptions/eta-report/', lazy: apiPage('/api/subscriptions/eta-report/', () => import('@/pages/Subscriptions/EtaReport')) },
  { path: '/subscriptions/eta-report/config/', lazy: apiPage('/api/subscriptions/eta-report/config/', () => import('@/pages/Subscriptions/EtaManagement')) },

  { path: '/crm/dashboard/', lazy: apiPage('/api/crm/dashboard/', () => import('@/pages/CRM/Dashboard')) },
  { path: '/crm/analytics/', lazy: apiPage('/api/crm/analytics/', () => import('@/pages/CRM/Analytics')) },
  { path: '/crm/results/', lazy: apiPage('/api/crm/results/', () => import('@/pages/CRM/Results')) },

  { path: '/support/dashboard/', lazy: apiPage('/api/support/dashboard/', () => import('@/pages/Support/Dashboard')) },
  { path: '/support/analytics/', lazy: apiPage('/api/support/analytics/', () => import('@/pages/Support/Analytics')) },
  { path: '/support/results/', lazy: apiPage('/api/support/results/', () => import('@/pages/Support/Results')) },
  { path: '/support/users/', lazy: apiPage('/api/support/users/', () => import('@/pages/Support/Users')) },
  { path: '/support/etapas/', lazy: apiPage('/api/support/stages/', () => import('@/pages/Support/Stages')) },

  { path: '/imports/subscriptions/', lazy: apiPage('/api/imports/subscriptions/', () => import('@/pages/Imports/Subscriptions')) },
  { path: '/imports/crm/', lazy: apiPage('/api/imports/crm/', () => import('@/pages/Imports/Crm')) },
  { path: '/imports/support/', lazy: apiPage('/api/imports/support/', () => import('@/pages/Imports/Support')) },
  { path: '/imports/history/', lazy: apiPage('/api/imports/history/', () => import('@/pages/Imports/History')) },

  { path: '/catalogos/notificaciones/', lazy: apiPage('/api/catalogs/notifications/', () => import('@/pages/Catalogs/Notifications')) },
  { path: '/catalogos/productos/', lazy: apiPage('/api/catalogs/products/', () => import('@/pages/Catalogs/Products')) },
  { path: '/catalogos/estructura/', lazy: apiPage('/api/catalogs/structure/', () => import('@/pages/Catalogs/Structure')) },
  { path: '/catalogos/ventas/', lazy: apiPage('/api/catalogs/sales/', () => import('@/pages/Catalogs/Sales')) },

  { path: '/comisiones/', lazy: apiPage('/api/commissions/report/', () => import('@/pages/Commissions/Report')) },
  { path: '/comisiones/condiciones/', lazy: apiPage('/api/commissions/conditions/', () => import('@/pages/Commissions/Conditions')) },

  { path: '/encuestas/instalados/', lazy: apiPage('/api/surveys/installed/', () => import('@/pages/Surveys/Survey')) },
  { path: '/encuestas/bajas/', lazy: apiPage('/api/surveys/churned/', () => import('@/pages/Surveys/Survey')) },
  { path: '/encuestas/configuracion/', lazy: apiPage('/api/surveys/settings/', () => import('@/pages/Surveys/Settings')) },

  { path: '/auditoria/', lazy: apiPage('/api/audit/logs/', () => import('@/pages/Audit/Log')) },
  { path: '/auditoria/monitoreo/', lazy: page(() => import('@/pages/Audit/Monitoring')) },

  { path: '*', element: <ServerRoute /> },
];

/** Una raíz sin marcado: lo que se pinta mientras carga el código de la primera página. */
export const routes: RouteObject[] = [
  { HydrateFallback: () => <LoadingState message="Cargando…" />, children: pages },
];
