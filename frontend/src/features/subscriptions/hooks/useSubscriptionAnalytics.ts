import { useMemo } from 'react';

export interface PeriodSelection { periodo_reporte: string; }

export function useSubscriptionAnalytics<T extends PeriodSelection, D>(
  periodos: T[],
  selectedPeriod: string,
  selectedDimension: string,
  dimensiones: Array<{ periodo_reporte: string; dimensiones: Record<string, D[]> }>,
) {
  const globalData = useMemo(
    () => periodos.find((period) => period.periodo_reporte === selectedPeriod),
    [periodos, selectedPeriod],
  );

  // Ensure callers receive a default object matching T to avoid runtime checks everywhere.
  const globalDataSafe = (globalData ?? ({} as T));

  const dimensionGroup = useMemo(
    () => dimensiones.find((group) => group.periodo_reporte === selectedPeriod)?.dimensiones ?? {},
    [dimensiones, selectedPeriod],
  );

  const currentDimensionData = useMemo(
    () => dimensionGroup[selectedDimension] ?? [],
    [dimensionGroup, selectedDimension],
  );

  return { globalData: globalDataSafe, dimensionGroup, currentDimensionData };
}
