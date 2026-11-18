/**
 * Los filtros de los reportes comerciales (Ventas y Unidades de Negocio):
 * búsqueda, sucursal, tecnología, filtro por métrica y día de corte.
 *
 * El día se resuelve en cliente sobre el mes que ya viene en los props; cambiar
 * de periodo vuelve al cierre del mes y pide el periodo nuevo al servidor.
 */

import { useState } from 'react';

import { useVisit } from '@/shared/page/PageData';
import type { DayMetrics } from '@/shared/types/domain';

import { EMPTY_METRIC_FILTER, type MetricFilter } from '../lib/metricFilter';
import { useDayMetrics } from './useDayMetrics';

export type TechnologyFilter = 'ALL' | 'FTTH' | 'RF';

export function useCommercialReportFilters(
  dayMetrics: DayMetrics | undefined,
  initialDay: number | null | undefined,
) {
  const visit = useVisit();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState<TechnologyFilter>('ALL');
  const [selectedDay, setSelectedDay] = useState(initialDay ?? 0);
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(EMPTY_METRIC_FILTER);
  const day = useDayMetrics(dayMetrics, selectedDay);

  const changePeriod = (period: string) => {
    setSelectedDay(0);
    visit({ period });
  };

  return {
    ...day,
    monthPeriod: dayMetrics?.month,
    searchTerm,
    setSearchTerm,
    selectedBranch,
    setSelectedBranch,
    selectedTech,
    setSelectedTech,
    setSelectedDay,
    metricFilter,
    setMetricFilter,
    changePeriod,
  };
}

export type CommercialReportFilters = ReturnType<typeof useCommercialReportFilters>;
