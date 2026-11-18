import { useCallback, useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/shared/lib/api';
import { toNumber } from '@/shared/utils';
import { fetchSupportBreakdown } from '../lib/supportApi';
import { emptyStats, flattenEntries, resolveStats, share } from '../lib/supportMetrics';
import {
  SUPPORT_BREAKDOWNS,
  type SupportAnalyticsProps,
  type SupportBreakdown,
  type SupportDimension,
  type SupportDimensionRow,
  type SupportGroupOption,
  type SupportStats,
  type SupportZoneRow,
} from '../types';

/** The drill-down of one dimension value, fetched on demand. */
export interface SupportBreakdownState {
  /** Which value is open; `null` closes the panel. */
  value: string | null;
  loading: boolean;
  error: string;
  stats: SupportStats;
  breakdowns: Record<SupportBreakdown, SupportDimensionRow[]>;
}

const EMPTY_BREAKDOWNS: Record<SupportBreakdown, SupportDimensionRow[]> = {
  tipo_solicitud: [],
  razon_falla: [],
  solucion_falla: [],
};

const CLOSED_BREAKDOWN: SupportBreakdownState = {
  value: null,
  loading: false,
  error: '',
  stats: emptyStats(),
  breakdowns: EMPTY_BREAKDOWNS,
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
  const groups = useMemo(() => props.analyticsData?.groups ?? {}, [props.analyticsData]);

  const period = props.selectedPeriod ?? props.analyticsData?.period ?? '';

  const groupOptions = useMemo<SupportGroupOption[]>(
    () =>
      Object.entries(groups)
        .map(([key, group]) => ({
          key,
          label: key,
          totalTickets: toNumber(group.metrics?.total_tickets),
        }))
        .sort((a, b) => b.totalTickets - a.totalTickets),
    [groups],
  );

  const activeGroupName = groups[selectedGroup] ? selectedGroup : (groupOptions[0]?.key ?? '');
  const activeGroup = groups[activeGroupName];

  const periodTotal = useMemo(
    () => groupOptions.reduce((acc, option) => acc + option.totalTickets, 0),
    [groupOptions],
  );

  const stats = useMemo(() => resolveStats(activeGroup?.metrics), [activeGroup]);
  const sharePct = share(stats.total_tickets, periodTotal);

  /** The values of the selected first-level axis, ranked by volume. */
  const dimensionRows = useMemo(
    () => flattenEntries(activeGroup?.[selectedDimension], stats.total_tickets),
    [activeGroup, selectedDimension, stats.total_tickets],
  );

  /** The three breakdowns at group level, before drilling into any value. */
  const breakdownRows = useMemo(
    () =>
      Object.fromEntries(
        SUPPORT_BREAKDOWNS.map((key) => [
          key,
          flattenEntries(activeGroup?.[key], stats.total_tickets),
        ]),
      ) as Record<SupportBreakdown, SupportDimensionRow[]>,
    [activeGroup, stats.total_tickets],
  );

  /**
   * Zone incidence of the active group.
   *
   * Keyed by group server-side so switching teams costs no round-trip, and
   * read with the same `activeGroupName` fallback as the rest of the view.
   */
  const zones = useMemo<SupportZoneRow[]>(
    () =>
      (props.analyticsData?.zone_incidence?.[activeGroupName] ?? []).map((entry) => {
        const totalSubscribers = toNumber(entry.total_subscribers);

        return {
          zona: entry.zona,
          site: entry.site,
          technology: entry.technology ?? '—',
          totalTickets: toNumber(entry.total_tickets),
          totalSubscribers,
          incidenceRate: toNumber(entry.incidence_rate_pct),
          mttrAverage: toNumber(entry.mttr_avg),
          pctResolved: toNumber(entry.pct_resolved),
          withoutPopulation: totalSubscribers <= 0,
        };
      }),
    [props.analyticsData, activeGroupName],
  );

  const [breakdown, setBreakdown] = useState<SupportBreakdownState>(CLOSED_BREAKDOWN);

  const closeBreakdown = useCallback(() => setBreakdown(CLOSED_BREAKDOWN), []);

  const openBreakdown = useCallback(
    async (value: string) => {
      if (!period) return;

      setBreakdown({ ...CLOSED_BREAKDOWN, value, loading: true });

      try {
        const data = await fetchSupportBreakdown({
          period,
          dimension: selectedDimension,
          value,
          group: activeGroupName,
        });

        const resolved = resolveStats(data.metrics);

        setBreakdown({
          value,
          loading: false,
          error: '',
          stats: resolved,
          breakdowns: Object.fromEntries(
            SUPPORT_BREAKDOWNS.map((key) => [
              key,
              flattenEntries(data.breakdowns?.[key], resolved.total_tickets),
            ]),
          ) as Record<SupportBreakdown, SupportDimensionRow[]>,
        });
      } catch (error) {
        setBreakdown({
          ...CLOSED_BREAKDOWN,
          value,
          error: getApiErrorMessage(error, 'No se pudo calcular el desglose del valor seleccionado.'),
        });
      }
    },
    [period, selectedDimension, activeGroupName],
  );

  return {
    period,
    groupOptions,
    activeGroupName,
    /** El bloque del grupo activo, con sus desgloses por tipo, razón y solución. */
    activeGroup,
    hasGroups: groupOptions.length > 0,
    stats,
    sharePct,
    dimensionRows,
    breakdownRows,
    zones,
    breakdown,
    openBreakdown,
    closeBreakdown,
  };
}
