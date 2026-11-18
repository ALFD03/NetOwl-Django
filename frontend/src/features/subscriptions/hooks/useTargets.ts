/**
 * Los objetivos comerciales de la página, listos para resolver.
 *
 * Llegan en el campo `objetivos` de los datos de las páginas de Subscriptions. Se
 * leen del contexto de la página y no por props porque los necesitan
 * componentes que están varios niveles por debajo de la página.
 */

import { useMemo } from 'react';

import { usePageProps } from '@/shared/page/PageData';

import type { ZoneConfig } from '../lib/dayReports';
import { DEFAULT_TARGETS, createResolver, type TargetsResolver } from '../lib/targets';
import type { TargetsConfig } from '../types';

interface PropsWithTargets {
  targets?: TargetsConfig;
  [key: string]: unknown;
}

/** La configuración cruda; los valores por defecto si la página no la trae. */
export function useTargetsConfig(): TargetsConfig {
  return usePageProps<PropsWithTargets>().targets ?? DEFAULT_TARGETS;
}

/**
 * El resolvedor de la página. `zones` es el `zonesConfig.zones` de los reportes; las
 * páginas que solo pintan totales globales lo omiten.
 */
export function useTargets(zones?: readonly ZoneConfig[]): TargetsResolver {
  const config = useTargetsConfig();
  return useMemo(() => createResolver(config, zones ?? []), [config, zones]);
}
