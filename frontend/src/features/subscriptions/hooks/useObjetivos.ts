/**
 * Los objetivos comerciales de la página, listos para resolver.
 *
 * Llegan en el prop `objetivos` de las páginas de Subscriptions. Se leen de la
 * página y no por props, igual que `usePermissions`, porque los necesitan
 * componentes que están varios niveles por debajo de la página.
 */

import { useMemo } from 'react';
import { usePage } from '@inertiajs/react';

import type { ZonaConfig } from '../lib/dayReports';
import { OBJETIVOS_POR_DEFECTO, crearResolver, type ResolverObjetivos } from '../lib/objetivos';
import type { ObjetivosConfig } from '../types';

interface PropsConObjetivos {
  objetivos?: ObjetivosConfig;
  [key: string]: unknown;
}

/** La configuración cruda; los valores por defecto si la página no la trae. */
export function useObjetivosConfig(): ObjetivosConfig {
  const { props } = usePage<PropsConObjetivos>();
  return props.objetivos ?? OBJETIVOS_POR_DEFECTO;
}

/**
 * El resolvedor de la página. `zonas` es el `zonasConfig` de los reportes; las
 * páginas que solo pintan totales globales lo omiten.
 */
export function useObjetivos(zonas?: readonly ZonaConfig[]): ResolverObjetivos {
  const config = useObjetivosConfig();
  return useMemo(() => crearResolver(config, zonas ?? []), [config, zonas]);
}
