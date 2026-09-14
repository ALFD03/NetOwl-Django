/**
 * Página Inertia `Subscriptions/Analytics` (`/subscriptions/analytics/`).
 *
 * Recibe el mes completo de métricas diarias en los props, de modo que mover la
 * barra de días es una reagrupación en cliente y no una vuelta al servidor.
 */

import { useState } from 'react';
import { router } from '@inertiajs/react';
import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { useSubscriptionsAnalyticsData } from '@/features/subscriptions/hooks/useSubscriptionsAnalyticsData';
import { AnalyticsCharts, AnalyticsDimensionTable, AnalyticsFilters, AnalyticsMetrics, type DimensionKey } from '@/features/subscriptions/components/analytics';
import { useDayMetrics } from '@/features/subscriptions/hooks/useDayMetrics';
import { DayProgressBar } from '@/shared/ui';
import type { DayMetrics, DimensionGroup, Periodo } from '@/shared/types/domain';

interface Props {
  periodos: Periodo[];
  dimensiones: DimensionGroup[];
  dayMetrics?: DayMetrics;
}

export default function SubscriptionsAnalytics({ periodos = [], dimensiones = [], dayMetrics }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(periodos[0]?.periodo_reporte || '');
  const [selectedDim, setSelectedDim] = useState<DimensionKey>('zona');
  const [selectedDay, setSelectedDay] = useState(0);

  const { globalData: monthData, currentDimensionData: monthDimensionData } =
    useSubscriptionsAnalyticsData(periodos, dimensiones, selectedPeriod, selectedDim);

  const { availableDays, totalDays, effectiveDay, dayData } = useDayMetrics(
    dayMetrics,
    selectedDay,
  );

  // Con un dia elegido mandan sus metricas globales y su desglose por
  // dimension; si no (o si el dia se calculo antes de guardar `dims`), se cae
  // al cierre del mes.
  const globalData = dayData?.global ?? monthData;
  const currentDimensionData = dayData?.dims?.[selectedDim] ?? monthDimensionData;

  // El mes se elige en cliente, pero la barra de dias vive en los props:
  // se recarga solo esa prop al cambiar de periodo.
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    setSelectedDay(0);
    router.get('/subscriptions/analytics/', { period }, {
      preserveState: true,
      preserveScroll: true,
      only: ['dayMetrics'],
    });
  };

  return (
    <AppLayout
      title="Subscriptions Advanced Analytics"
      toolbar={
        <>
          <ModuleHeader module="subscriptions" activeTab="analytics" />
          <AnalyticsFilters
            periods={periodos.map((period) => period.periodo_reporte)}
            selectedPeriod={selectedPeriod}
            onPeriodChange={handlePeriodChange}
            selectedDimension={selectedDim}
            onDimensionChange={setSelectedDim}
          />
          {availableDays.length > 0 && (
            <div className="mb-8">
              <DayProgressBar
                availableDays={availableDays}
                periodoMes={dayMetrics?.periodo_mes}
                daysInMonth={totalDays}
                selectedDay={effectiveDay}
                onSelect={setSelectedDay}
              />
            </div>
          )}
        </>
      }
    >
      <AnalyticsMetrics data={globalData} />
      <AnalyticsCharts
        globalData={globalData}
        currentDimensionData={currentDimensionData}
        selectedDimension={selectedDim}
      />

      <div className="mt-12">
        <AnalyticsDimensionTable
          rows={currentDimensionData}
          dimension={selectedDim}
          period={selectedPeriod}
        />
      </div>
    </AppLayout>
  );
}
