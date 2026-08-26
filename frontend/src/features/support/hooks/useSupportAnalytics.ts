import { useMemo } from 'react';

import { toNumber } from '@/shared/utils/formatters';
import type {
  SupportAnalyticsProps,
  SupportBreakdownRow,
  SupportDimensionEntry,
  SupportDimensionMetrics,
  SupportGroup,
  SupportGroupOption,
  SupportGroupStats,
  SupportSolutionRow,
  SupportTimeDistribution,
  SupportZoneRow,
} from '../types';

const EMPTY_DISTRIBUTION: SupportTimeDistribution = {
  promedio: 0,
  mediana: 0,
  min: 0,
  p25: 0,
  p75: 0,
  max: 0,
  std: 0,
  pctExcedeProm: 0,
  pctExcedeMed: 0,
  muestra: 0,
};

const EMPTY_STATS: SupportGroupStats = {
  totalTickets: 0,
  resueltos: 0,
  cancelados: 0,
  rezagados: 0,
  pctResueltos: 0,
  pctCancelados: 0,
  pctRezagados: 0,
  cierre: EMPTY_DISTRIBUTION,
  cierreTotal: EMPTY_DISTRIBUTION,
  primeraRespuesta: EMPTY_DISTRIBUTION,
  sharePct: 0,
};

/** The three measures the analyzer emits, keyed by their column suffix. */
const MEASURES = {
  cierre: 'cierre',
  cierreTotal: 'cierre_total',
  primeraRespuesta: 'primera_respuesta',
} as const;

function share(part: number, whole: number): number {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0;
}

/** Reads one `_compute_stats_for_series` block out of its flat column names. */
function distribution(m: SupportDimensionMetrics, medida: string): SupportTimeDistribution {
  const num = (key: string) => toNumber((m as Record<string, number | undefined>)[key]);

  return {
    promedio: num(`tiempo_medio_${medida}_horas`),
    mediana: num(`tiempo_mediana_${medida}_horas`),
    min: num(`tiempo_min_${medida}_horas`),
    p25: num(`tiempo_p25_${medida}_horas`),
    p75: num(`tiempo_p75_${medida}_horas`),
    max: num(`tiempo_max_${medida}_horas`),
    std: num(`tiempo_std_${medida}_horas`),
    pctExcedeProm: num(`pct_excede_promedio_${medida}`),
    pctExcedeMed: num(`pct_excede_mediana_${medida}`),
    muestra: num(`muestra_${medida}`),
  };
}

/**
 * Hoists `metricas` to the top level and restates each value's weight against
 * the group total, since only `razones_falla` arrives with `pct_del_grupo`.
 */
function flatten(entries: SupportDimensionEntry[], groupTotal: number): SupportBreakdownRow[] {
  return entries
    .map((entry) => {
      const metricas = entry.metricas ?? {};
      const total = toNumber(metricas.total_tickets);

      return {
        ...metricas,
        nombre: entry.nombre,
        pctDelGrupo: metricas.pct_del_grupo != null
          ? toNumber(metricas.pct_del_grupo)
          : share(total, groupTotal),
      };
    })
    .sort((a, b) => toNumber(b.total_tickets) - toNumber(a.total_tickets));
}

function statsFor(group: SupportGroup, periodTotal: number): SupportGroupStats {
  const m = group.metricas_grupo ?? {};
  const totalTickets = toNumber(group.total_tickets_grupo) || toNumber(m.total_tickets);

  return {
    totalTickets,
    resueltos: toNumber(m.tickets_resueltos),
    cancelados: toNumber(m.tickets_cancelados),
    rezagados: toNumber(m.tickets_rezagados),
    pctResueltos: toNumber(m.pct_resueltos),
    pctCancelados: toNumber(m.pct_cancelados),
    pctRezagados: toNumber(m.pct_rezagados),
    cierre: distribution(m, MEASURES.cierre),
    cierreTotal: distribution(m, MEASURES.cierreTotal),
    primeraRespuesta: distribution(m, MEASURES.primeraRespuesta),
    sharePct: share(totalTickets, periodTotal),
  };
}

/**
 * Resolves one work group into everything the drill-down renders, plus the
 * period's zone incidence — which is deliberately not group-scoped.
 *
 * `selectedGroup` is a hint, not a guarantee: changing the period swaps the
 * whole payload, and the previously selected group may not exist in the new
 * one — so the first group by volume is always the fallback.
 */
export function useSupportAnalytics(props: SupportAnalyticsProps, selectedGroup: string) {
  const grupos = props.analyticsData?.grupos ?? {};
  const incidencia = props.analyticsData?.incidencia_zonas ?? [];

  const groupOptions = useMemo<SupportGroupOption[]>(
    () =>
      Object.entries(grupos)
        .map(([key, group]) => ({
          key,
          label: key,
          totalTickets: toNumber(group.total_tickets_grupo),
        }))
        .sort((a, b) => b.totalTickets - a.totalTickets),
    [grupos],
  );

  const activeGroupName = grupos[selectedGroup] ? selectedGroup : (groupOptions[0]?.key ?? '');
  const activeGroup = grupos[activeGroupName];

  const periodTotal = useMemo(
    () => groupOptions.reduce((acc, option) => acc + option.totalTickets, 0),
    [groupOptions],
  );

  const stats = useMemo<SupportGroupStats>(
    () => (activeGroup ? statsFor(activeGroup, periodTotal) : EMPTY_STATS),
    [activeGroup, periodTotal],
  );

  const razones = useMemo(
    () => flatten(activeGroup?.razones_falla ?? [], stats.totalTickets),
    [activeGroup, stats.totalTickets],
  );

  const tipos = useMemo(
    () => flatten(activeGroup?.tipos_solicitud ?? [], stats.totalTickets),
    [activeGroup, stats.totalTickets],
  );

  const sucursales = useMemo(
    () => flatten(activeGroup?.sucursales ?? [], stats.totalTickets),
    [activeGroup, stats.totalTickets],
  );

  const soluciones = useMemo<SupportSolutionRow[]>(
    () =>
      (activeGroup?.soluciones_falla ?? [])
        .map((entry) => ({
          nombre: entry.nombre,
          total: toNumber(entry.total),
          pct: toNumber(entry.pct),
        }))
        .sort((a, b) => b.total - a.total),
    [activeGroup],
  );

  const zonas = useMemo<SupportZoneRow[]>(
    () =>
      incidencia.map((entry) => {
        const totalSuscriptores = toNumber(entry.total_suscriptores);

        return {
          zona: entry.zona,
          site: entry.site,
          tecnologia: entry.tecnologia ?? '—',
          totalTickets: toNumber(entry.total_tickets),
          totalSuscriptores,
          tasaIncidencia: toNumber(entry.tasa_incidencia_pct),
          mttrPromedio: toNumber(entry.mttr_promedio),
          sinPoblacion: totalSuscriptores <= 0,
        };
      }),
    [incidencia],
  );

  return {
    groupOptions,
    activeGroupName,
    hasGroups: groupOptions.length > 0,
    stats,
    razones,
    tipos,
    sucursales,
    soluciones,
    zonas,
  };
}
