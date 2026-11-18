/** Recorta a un periodo y una dimensión lo que ya llegó en los props. */

import { useMemo } from 'react';
import type { DimensionGroup, DimensionVal, Period } from '@/shared/types/domain';

export function useSubscriptionsAnalyticsData(
  periods: Period[],
  dimensions: DimensionGroup[],
  selectedPeriod: string,
  selectedDim: string,
) {
  const globalData = useMemo(
    () => periods.find((period) => period.report_period === selectedPeriod) ?? { report_period: selectedPeriod },
    [periods, selectedPeriod],
  );

  const dimensionGroup = useMemo(
    () => dimensions.find((group) => group.report_period === selectedPeriod)?.dimensions ?? {},
    [dimensions, selectedPeriod],
  );

  const currentDimensionData = useMemo<DimensionVal[]>(
    () => dimensionGroup[selectedDim] ?? [],
    [dimensionGroup, selectedDim],
  );

  return { globalData, dimensionGroup, currentDimensionData };
}
