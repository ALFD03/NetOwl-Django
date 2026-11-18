/**
 * Lo que necesita la página de Unidades de Negocio: filtros, grupos del día o
 * del cierre recortados al alcance de quien mira, y sus totales FTTH.
 *
 * Quien no ve todas las unidades recibe `scope` y solo los datos de las suyas.
 * Al reagrupar un día, una zona RF visible puede colgar de otro coordinador,
 * así que los grupos se vuelven a recortar aquí con el alcance.
 */

import { useMemo } from 'react';

import type { DayMetrics } from '@/shared/types/domain';

import { buildBusinessUnitGroups, type ZonesConfig } from '../lib/dayReports';
import {
  useBusinessUnitsData,
  type BusinessUnitGroup,
  type FtthNodeTotals,
} from './useBusinessUnitsData';
import { useCommercialReportFilters } from './useCommercialReportFilters';
import { useTargets } from './useTargets';

export interface BusinessUnitsProps {
  buData?: {
    data?: BusinessUnitGroup[];
    periods?: string[];
    period?: string;
    day?: number | null;
    /** Solo para quien no ve todas las unidades. */
    scope?: { coordinators: string[]; rf: boolean };
    ftth_totals?: { close: FtthNodeTotals; days: Record<string, FtthNodeTotals> };
  };
  dayMetrics?: DayMetrics;
  zonesConfig?: ZonesConfig;
}

export function useBusinessUnitsPage({ buData = {}, dayMetrics, zonesConfig }: BusinessUnitsProps) {
  const filters = useCommercialReportFilters(dayMetrics, buData.day);
  const { dayData, effectiveDay, projection } = filters;
  const { scope, ftth_totals: ftthTotals } = buData;

  const groups = useMemo(() => {
    const allRows = dayData
      ? buildBusinessUnitGroups(dayData.dimensions, zonesConfig)
      : (buData.data ?? []);
    if (!scope) return allRows;
    return allRows.filter((group) =>
      group.is_rf ? scope.rf : scope.coordinators.includes(group.coordinator),
    );
  }, [dayData, zonesConfig, buData.data, scope]);
  const ftthFixed = ftthTotals
    ? ((dayData ? ftthTotals.days[String(effectiveDay)] : ftthTotals.close) ?? null)
    : null;

  // Los objetivos vienen en los props; `zonesConfig` dice a qué coordinador,
  // site y estado pertenece cada zona, que es por donde se heredan.
  const targets = useTargets(zonesConfig?.zones);
  const period = buData.period ?? '';

  const { branchList, filteredData, dynamicFtthSummary } = useBusinessUnitsData({
    groups,
    searchTerm: filters.searchTerm,
    selectedBranch: filters.selectedBranch,
    selectedTech: filters.selectedTech,
    period,
    targets,
    projection,
    metricFilter: filters.metricFilter,
    ftthFixed,
  });

  return {
    filters,
    period,
    periods: buData.periods ?? [],
    branchList,
    filteredData,
    dynamicFtthSummary,
  };
}
