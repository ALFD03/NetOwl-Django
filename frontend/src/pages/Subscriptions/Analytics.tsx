import { useState } from 'react';
import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { useSubscriptionsAnalyticsData } from '@/features/subscriptions/hooks/useSubscriptionsAnalyticsData';
import { AnalyticsCharts, AnalyticsFilters, AnalyticsMetrics, type DimensionKey } from '@/features/subscriptions/components/analytics';
import type { DimensionGroup, Periodo } from '@/shared/types/domain';

interface Props {
  periodos: Periodo[];
  dimensiones: DimensionGroup[];
}

export default function SubscriptionsAnalytics({ periodos = [], dimensiones = [] }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(periodos[0]?.periodo_reporte || '');
  const [selectedDim, setSelectedDim] = useState<DimensionKey>('zona');

  const { globalData, currentDimensionData } = useSubscriptionsAnalyticsData(
    periodos,
    dimensiones,
    selectedPeriod,
    selectedDim,
  );

  return (
    <AppLayout title="Subscriptions Advanced Analytics">
      <ModuleHeader module="subscriptions" activeTab="analytics" />

      <AnalyticsFilters
        periods={periodos.map((period) => period.periodo_reporte)}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        selectedDimension={selectedDim}
        onDimensionChange={setSelectedDim}
      />

      <AnalyticsMetrics data={globalData} />
      <AnalyticsCharts
        globalData={globalData}
        currentDimensionData={currentDimensionData}
        selectedDimension={selectedDim}
      />
    </AppLayout>
  );
}
