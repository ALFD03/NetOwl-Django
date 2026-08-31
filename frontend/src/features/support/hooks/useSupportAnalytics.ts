import { useCallback, useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/shared/lib/api';
import { toNumber } from '@/shared/utils';
import { fetchSupportBreakdown } from '../lib/supportApi';
import { emptyStats, flattenEntries, resolveStats, share } from '../lib/supportMetrics';
import {
  SUPPORT_DESGLOSES,
  type SupportAnalyticsProps,
  type SupportDesglose,
  type SupportDimension,
  type SupportDimensionRow,
  type SupportGroupOption,
  type SupportStats,
  type SupportZoneRow,
} from '../types';

/** The drill-down of one dimension value, fetched on demand. */
export interface SupportBreakdownState {
  /** Which value is open; `null` closes the panel. */
  valor: string | null;
  loading: boolean;
  error: string;
  stats: SupportStats;
  desgloses: Record<SupportDesglose, SupportDimensionRow[]>;
}

const EMPTY_DESGLOSES: Record<SupportDesglose, SupportDimensionRow[]> = {
  tipo_solicitud: [],
  razon_falla: [],
  solucion_falla: [],
};

const CLOSED_BREAKDOWN: SupportBreakdownState = {
  valor: null,
  loading: false,
  error: '',
  stats: emptyStats(),
  desgloses: EMPTY_DESGLOSES,
};

/**
 * Everything the period view renders for one work group and one dimension.
 *
 * `selectedGroup` is a hint, not a guarantee: changing the period swaps the
 * whole payload, and the previously selected group may not exist in the new
 * one — so the first group by volume is always the fallback.
 */
export function useSupportAnalytics(
  props: SupportAnalyticsProps,
  selectedGroup: string,
  selectedDimension: SupportDimension,
) {
  const grupos = useMemo(() => props.analyticsData?.grupos ?? {}, [props.analyticsData]);
  const incidencia = useMemo(() => props.analyticsData?.incidencia_zonas ?? [], [props.analyticsData]);

  const periodo = props.selectedPeriod ?? props.analyticsData?.periodo ?? '';

  const groupOptions = useMemo<SupportGroupOption[]>(
    () =>
      Object.entries(grupos)
        .map(([key, group]) => ({
          key,
          label: key,
          totalTickets: toNumber(group.metricas?.total_tickets),
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

  const stats = useMemo(() => resolveStats(activeGroup?.metricas), [activeGroup]);
  const sharePct = share(stats.total_tickets, periodTotal);

  /** The values of the selected first-level axis, ranked by volume. */
  const dimensionRows = useMemo(
    () => flattenEntries(activeGroup?.[selectedDimension], stats.total_tickets),
    [activeGroup, selectedDimension, stats.total_tickets],
  );

  /** The three breakdowns at group level, before drilling into any value. */
  const desgloseRows = useMemo(
    () =>
      Object.fromEntries(
        SUPPORT_DESGLOSES.map((key) => [
          key,
          flattenEntries(activeGroup?.[key], stats.total_tickets),
        ]),
      ) as Record<SupportDesglose, SupportDimensionRow[]>,
    [activeGroup, stats.total_tickets],
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
          pctResueltos: toNumber(entry.pct_resueltos),
          sinPoblacion: totalSuscriptores <= 0,
        };
      }),
    [incidencia],
  );

  const [breakdown, setBreakdown] = useState<SupportBreakdownState>(CLOSED_BREAKDOWN);

  const closeBreakdown = useCallback(() => setBreakdown(CLOSED_BREAKDOWN), []);

  const openBreakdown = useCallback(
    async (valor: string) => {
      if (!periodo) return;

      setBreakdown({ ...CLOSED_BREAKDOWN, valor, loading: true });

      try {
        const data = await fetchSupportBreakdown({
          period: periodo,
          dimension: selectedDimension,
          valor,
          grupo: activeGroupName,
        });

        const resolved = resolveStats(data.metricas);

        setBreakdown({
          valor,
          loading: false,
          error: '',
          stats: resolved,
          desgloses: Object.fromEntries(
            SUPPORT_DESGLOSES.map((key) => [
              key,
              flattenEntries(data.desgloses?.[key], resolved.total_tickets),
            ]),
          ) as Record<SupportDesglose, SupportDimensionRow[]>,
        });
      } catch (error) {
        setBreakdown({
          ...CLOSED_BREAKDOWN,
          valor,
          error: getApiErrorMessage(error, 'No se pudo calcular el desglose del valor seleccionado.'),
        });
      }
    },
    [periodo, selectedDimension, activeGroupName],
  );

  return {
    periodo,
    groupOptions,
    activeGroupName,
    hasGroups: groupOptions.length > 0,
    stats,
    sharePct,
    dimensionRows,
    desgloseRows,
    zonas,
    breakdown,
    openBreakdown,
    closeBreakdown,
  };
}
