/**
 * Página Inertia `Subscriptions/Analytics` (`/subscriptions/analytics/`).
 *
 * Recibe el mes completo de métricas diarias en los props, de modo que mover la
 * barra de días es una reagrupación en cliente y no una vuelta al servidor.
 */

import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import { AppLayout } from '@/shared/layout/AppLayout';
import { useSubscriptionsAnalyticsData } from '@/features/subscriptions/hooks/useSubscriptionsAnalyticsData';
import { AnalyticsCharts, AnalyticsDimensionTable, AnalyticsFilters, AnalyticsMetrics, ProyeccionCierre, type DimensionKey } from '@/features/subscriptions/components/analytics';
import { CampannasExportButton } from '@/features/subscriptions/components/campaigns/CampannasExportButton';
import { useDayMetrics } from '@/features/subscriptions/hooks/useDayMetrics';
import { SUBS_DAY_CHARTS, subsDayCards } from '@/features/subscriptions/lib/subsDaySummary';
import { useObjetivosConfig } from '@/features/subscriptions/hooks/useObjetivos';
import { DayProgressBar, DaySummary } from '@/shared/ui';
import type { DayMetrics, DaySeries, DimensionGroup, Periodo } from '@/shared/types/domain';

interface Props {
  periodos: Periodo[];
  dimensiones: DimensionGroup[];
  dayMetrics?: DayMetrics;
}

export default function SubscriptionsAnalytics({ periodos = [], dimensiones = [], dayMetrics }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(periodos[0]?.periodo_reporte || '');
  const [selectedDim, setSelectedDim] = useState<DimensionKey>('zona');
  const [selectedDay, setSelectedDay] = useState(0);

  const { globalData: monthData, dimensionGroup: monthDimensions, currentDimensionData: monthDimensionData } =
    useSubscriptionsAnalyticsData(periodos, dimensiones, selectedPeriod, selectedDim);

  const { availableDays, totalDays, effectiveDay, dayData, proyeccion } = useDayMetrics(
    dayMetrics,
    selectedDay,
  );

  // El churn del día se pinta con el semáforo del catálogo.
  const { semaforo } = useObjetivosConfig();
  const diaCards = useMemo(() => subsDayCards(semaforo), [semaforo]);

  // La serie ligera que CRM y Soporte reciben aparte, aqui se saca del mes que
  // ya viajo entero: es el mismo bloque global, dia a dia.
  const serie = useMemo<DaySeries>(
    () =>
      Object.fromEntries(
        Object.entries(dayMetrics?.dias ?? {}).map(([dia, payload]) => [
          dia,
          (payload.global ?? {}) as unknown as Record<string, number>,
        ]),
      ),
    [dayMetrics],
  );

  // Con un dia elegido mandan sus metricas globales y su desglose por
  // dimension; si no (o si el dia se calculo antes de guardar `dims`), se cae
  // al cierre del mes.
  const globalData = dayData?.global ?? monthData;
  // La proyección sale de las instalaciones acumuladas al corte elegido; un día
  // calculado antes de guardar el bloque global no tiene de dónde sacarlas.
  const instaladasAlCorte = dayData?.global?.nuevos_mes;
  const currentDimensionData = dayData?.dims?.[selectedDim] ?? monthDimensionData;
  // El reporte de campañas sigue la misma regla, pero siempre sobre `campanna`;
  // si cae al cierre, el archivo no debe decir que es el corte de un día.
  const campannasDelDia = dayData?.dims?.campanna;
  const campannas = campannasDelDia ?? monthDimensions.campanna ?? [];

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
      toolbar={
        <>
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
      <div className="mb-6">
        <CampannasExportButton filas={campannas} periodo={selectedPeriod} dia={campannasDelDia ? effectiveDay : 0} />
      </div>

      <DaySummary
        serie={serie}
        dias={availableDays}
        dia={effectiveDay}
        cards={diaCards}
        charts={SUBS_DAY_CHARTS}
      >
        {proyeccion && instaladasAlCorte !== undefined && (
          <ProyeccionCierre instalaciones={Number(instaladasAlCorte)} proyeccion={proyeccion} />
        )}
      </DaySummary>

      <div className="mt-6">
        <AnalyticsMetrics data={globalData} periodo={selectedPeriod} />
      </div>
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
