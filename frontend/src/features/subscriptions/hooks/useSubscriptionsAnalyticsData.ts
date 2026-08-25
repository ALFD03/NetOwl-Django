import { useMemo } from 'react';
import type { DimensionGroup, DimensionVal, Periodo } from '@/shared/types/domain';

export function useSubscriptionsAnalyticsData(
  periodos: Periodo[],
  dimensiones: DimensionGroup[],
  selectedPeriod: string,
  selectedDim: string,
) {
  const globalData = useMemo(
    () => periodos.find((period) => period.periodo_reporte === selectedPeriod) ?? { periodo_reporte: selectedPeriod },
    [periodos, selectedPeriod],
  );

  const dimensionGroup = useMemo(
    () => dimensiones.find((group) => group.periodo_reporte === selectedPeriod)?.dimensiones ?? {},
    [dimensiones, selectedPeriod],
  );

  const currentDimensionData = useMemo<DimensionVal[]>(
    () => dimensionGroup[selectedDim] ?? [],
    [dimensionGroup, selectedDim],
  );

  return { globalData, dimensionGroup, currentDimensionData };
}
