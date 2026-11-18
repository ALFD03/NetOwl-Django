/**
 * Página `/subscriptions/analytics/`.
 *
 * Recibe el mes completo de métricas diarias en los props, de modo que mover la
 * barra de días es una reagrupación en cliente y no una vuelta al servidor.
 */

import { useMemo, useState } from 'react';
import { AppLayout } from '@/shared/layout/AppLayout';
import { useSubscriptionsAnalyticsData } from '@/features/subscriptions/hooks/useSubscriptionsAnalyticsData';
import { AnalyticsCharts, AnalyticsDimensionTable, AnalyticsFilters, AnalyticsMetrics, CloseProjection, type DimensionKey } from '@/features/subscriptions/components/analytics';
import { CampannasExportButton } from '@/features/subscriptions/components/campaigns/CampannasExportButton';
import { useDayMetrics } from '@/features/subscriptions/hooks/useDayMetrics';
import { SUBS_DAY_CHARTS, subsDayCards } from '@/features/subscriptions/lib/subsDaySummary';
import { useTargets } from '@/features/subscriptions/hooks/useTargets';
import { periodCompliance, complianceTone } from '@/features/subscriptions/lib/targets';
import { proyectar } from '@/shared/lib/projection';
import { DayProgressBar, DaySummary } from '@/shared/ui';
import type { DayMetrics, DaySeries, DimensionGroup, Period } from '@/shared/types/domain';
import { useVisit } from '@/shared/page/PageData';

interface Props {
  closings: Period[];
  dimensions: DimensionGroup[];
  dayMetrics?: DayMetrics;
}

export default function SubscriptionsAnalytics({ closings = [], dimensions = [], dayMetrics }: Props) {
  const visit = useVisit();
  const [selectedPeriod, setSelectedPeriod] = useState(closings[0]?.report_period || '');
  const [selectedDim, setSelectedDim] = useState<DimensionKey>('zona');
  const [selectedDay, setSelectedDay] = useState(0);

  const { globalData: monthData, dimensionGroup: monthDimensions, currentDimensionData: monthDimensionData } =
    useSubscriptionsAnalyticsData(closings, dimensions, selectedPeriod, selectedDim);

  const { availableDays, totalDays, effectiveDay, dayData, proyeccion } = useDayMetrics(
    dayMetrics,
    selectedDay,
  );

  // El churn del día se pinta con el semáforo del catálogo.
  const objetivos = useTargets();
  const { thresholds } = objetivos;
  const dayCards = useMemo(() => subsDayCards(thresholds), [thresholds]);

  // La serie ligera que CRM y Soporte reciben aparte, aqui se saca del mes que
  // ya viajo entero: es el mismo bloque global, dia a dia.
  const serie = useMemo<DaySeries>(
    () =>
      Object.fromEntries(
        Object.entries(dayMetrics?.days ?? {}).map(([dia, payload]) => [
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
  const installedAtCutoff = dayData?.global?.new_in_month;
  // El cumplimiento de ventas que darían las instalaciones proyectadas, contra
  // la misma meta y sin recorte, como la tarjeta de Cumplimiento de Ventas.
  // Sin base inicial no hay meta y la franja no habla del objetivo.
  const projectedCompliance = useMemo(() => {
    if (!proyeccion || installedAtCutoff === undefined) return null;
    const proyectadas = proyectar(Number(installedAtCutoff), proyeccion);
    const { salesGoal: metaVentas, salesCompliance: cumplimientoVentas } = periodCompliance(
      { active_start: globalData.active_start, new_in_month: proyectadas },
      objetivos.general(selectedPeriod),
    );
    if (metaVentas <= 0) return null;
    return { value: cumplimientoVentas, target: metaVentas, tono: complianceTone(cumplimientoVentas, thresholds) };
  }, [proyeccion, installedAtCutoff, globalData.active_start, objetivos, selectedPeriod, thresholds]);
  const currentDimensionData = dayData?.dims?.[selectedDim] ?? monthDimensionData;
  // El reporte de campañas sigue la misma regla, pero siempre sobre `campanna`;
  // si cae al cierre, el archivo no debe decir que es el corte de un día.
  const dayCampaigns = dayData?.dims?.campanna;
  const campannas = dayCampaigns ?? monthDimensions.campanna ?? [];

  // El mes se elige en cliente, pero la barra de dias vive en los props:
  // se recarga solo esa prop al cambiar de periodo.
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    setSelectedDay(0);
    visit({ period });
  };

  return (
    <AppLayout
      toolbar={
        <>
          <AnalyticsFilters
            periods={closings.map((period) => period.report_period)}
            selectedPeriod={selectedPeriod}
            onPeriodChange={handlePeriodChange}
            selectedDimension={selectedDim}
            onDimensionChange={setSelectedDim}
          />
          {availableDays.length > 0 && (
            <div className="mb-8">
              <DayProgressBar
                availableDays={availableDays}
                monthPeriod={dayMetrics?.month}
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
        <CampannasExportButton rows={campannas} period={selectedPeriod} day={dayCampaigns ? effectiveDay : 0} />
      </div>

      <DaySummary
        serie={serie}
        dias={availableDays}
        dia={effectiveDay}
        cards={dayCards}
        charts={SUBS_DAY_CHARTS}
      >
        {proyeccion && installedAtCutoff !== undefined && (
          <CloseProjection
            instalaciones={Number(installedAtCutoff)}
            projection={proyeccion}
            cumplimiento={projectedCompliance}
          />
        )}
      </DaySummary>

      <div className="mt-6">
        <AnalyticsMetrics data={globalData} period={selectedPeriod} />
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
