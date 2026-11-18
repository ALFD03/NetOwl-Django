/** Recorta a un periodo y una dimensión lo que ya llegó en los props. */

import { useMemo } from 'react';
import type { DimensionGroup, DimensionVal, Period } from '@/shared/types/domain';

export function useSubscriptionsAnalyticsData(
  periodos: Period[],
  dimensiones: DimensionGroup[],
  selectedPeriod: string,
  selectedDim: string,
) {
  const globalData = useMemo(
    () => periodos.find((period) => period.report_period === selectedPeriod) ?? { report_period: selectedPeriod },
    [periodos, selectedPeriod],
  );

  const dimensionGroup = useMemo(
    () => dimensiones.find((group) => group.report_period === selectedPeriod)?.dimensions ?? {},
    [dimensiones, selectedPeriod],
  );

  const currentDimensionData = useMemo<DimensionVal[]>(
    () => dimensionGroup[selectedDim] ?? [],
    [dimensionGroup, selectedDim],
  );

  return { globalData, dimensionGroup, currentDimensionData };
}
