/**
 * Lo que necesita la página de Ventas: filtros y sites del día o del cierre.
 *
 * El mes entero ya viaja en los props: elegir un día solo reagrupa en memoria
 * con `buildSalesSites`, sin pedir nada al servidor. Sin días calculados se
 * usa el cierre del mes.
 */

import { useMemo } from 'react';

import type { DayMetrics } from '@/shared/types/domain';

import type { OfficeCoordinator } from '../components/reports/OfficeCoordinatorBadges';
import { buildSalesSites, type ZonesConfig } from '../lib/dayReports';
import { useCommercialReportFilters } from './useCommercialReportFilters';
import { useSalesReportData, type SalesReportSite } from './useSalesReportData';
import { useTargets } from './useTargets';

export interface SalesReportProps {
  reportData?: {
    data?: SalesReportSite[];
    periods?: string[];
    period?: string;
    day?: number | null;
  };
  dayMetrics?: DayMetrics;
  zonesConfig?: ZonesConfig;
  /** Las coordinadoras de oficina de cada site, con sus ventas por día y su objetivo. */
  officeCoordinators?: OfficeCoordinator[];
}

export function useSalesReportPage({ reportData = {}, dayMetrics, zonesConfig }: SalesReportProps) {
  const filters = useCommercialReportFilters(dayMetrics, reportData.day);
  const { dayData, projection } = filters;
  const period = reportData.period ?? '';

  const sites = useMemo(
    () => (dayData ? buildSalesSites(dayData.dimensions, zonesConfig) : (reportData.data ?? [])),
    [dayData, zonesConfig, reportData.data],
  );

  // Los objetivos vienen en los props; `zonesConfig` dice a qué coordinador,
  // site y estado pertenece cada zona, que es por donde se heredan.
  const targets = useTargets(zonesConfig?.zones);

  const { branchList, filteredData } = useSalesReportData({
    sites,
    searchTerm: filters.searchTerm,
    selectedBranch: filters.selectedBranch,
    selectedTech: filters.selectedTech,
    period,
    targets,
    metricFilter: filters.metricFilter,
    projection,
  });

  return { filters, period, periods: reportData.periods ?? [], branchList, filteredData };
}
