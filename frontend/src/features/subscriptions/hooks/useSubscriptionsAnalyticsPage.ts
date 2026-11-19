/**
 * Lo que necesita la página de Analytics de suscripciones: periodo, dimensión y
 * día elegidos, y lo que se pinta con ellos.
 *
 * Con un día elegido mandan sus métricas globales y su desglose por dimensión;
 * si no (o si el día se calculó antes de guardar `dims`), se cae al cierre del mes.
 */

import { useMemo, useState } from 'react';

import { project } from '@/shared/lib/projection';
import { useVisit } from '@/shared/page/PageData';
import type { DayMetrics, DaySeries, DimensionGroup, Period } from '@/shared/types/domain';

import type { DimensionKey } from '../components/analytics';
import { SUBS_DAY_CHARTS, subsDayCards } from '../lib/subsDaySummary';
import { complianceTone, periodCompliance } from '../lib/targets';
import { useDayMetrics } from './useDayMetrics';
import { useSubscriptionsAnalyticsData } from './useSubscriptionsAnalyticsData';
import { useTargets } from './useTargets';

export interface SubscriptionsAnalyticsProps {
  closings: Period[];
  dimensions: DimensionGroup[];
  dayMetrics?: DayMetrics;
}

export function useSubscriptionsAnalyticsPage({
  closings = [],
  dimensions = [],
  dayMetrics,
}: SubscriptionsAnalyticsProps) {
  const visit = useVisit();
  const [selectedPeriod, setSelectedPeriod] = useState(closings[0]?.report_period || '');
  const [selectedDim, setSelectedDim] = useState<DimensionKey>('zona');
  const [selectedDay, setSelectedDay] = useState(0);

  const {
    globalData: monthData,
    dimensionGroup: monthDimensions,
    currentDimensionData: monthDimensionData,
  } = useSubscriptionsAnalyticsData(closings, dimensions, selectedPeriod, selectedDim);

  const { availableDays, totalDays, effectiveDay, dayData, projection } = useDayMetrics(
    dayMetrics,
    selectedDay,
  );

  // El churn del día se pinta con el semáforo del catálogo.
  const targets = useTargets();
  const { thresholds } = targets;
  const dayCards = useMemo(() => subsDayCards(thresholds), [thresholds]);

  // La serie ligera que CRM y Soporte reciben aparte, aqui se saca del mes que
  // ya viajo entero: es el mismo bloque global, dia a dia.
  const series = useMemo<DaySeries>(
    () =>
      Object.fromEntries(
        Object.entries(dayMetrics?.days ?? {}).map(([day, payload]) => [
          day,
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
    if (!projection || installedAtCutoff === undefined) return null;
    const projected = project(Number(installedAtCutoff), projection);
    const { salesGoal, salesCompliance } = periodCompliance(
      { active_start: globalData.active_start, new_in_month: projected },
      targets.general(selectedPeriod),
    );
    if (salesGoal <= 0) return null;
    return {
      value: salesCompliance,
      target: salesGoal,
      tone: complianceTone(salesCompliance, thresholds),
    };
  }, [projection, installedAtCutoff, globalData.active_start, targets, selectedPeriod, thresholds]);
  const currentDimensionData = dayData?.dims?.[selectedDim] ?? monthDimensionData;
  // El reporte de campañas sigue la misma regla, pero siempre sobre `campanna`;
  // si cae al cierre, el archivo no debe decir que es el corte de un día.
  const dayCampaigns = dayData?.dims?.campanna;
  const campaigns = dayCampaigns ?? monthDimensions.campanna ?? [];

  // El mes se elige en cliente, pero la barra de dias vive en los props:
  // se recarga solo esa prop al cambiar de periodo.
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    setSelectedDay(0);
    visit({ period });
  };

  return {
    periods: closings.map((period) => period.report_period),
    monthPeriod: dayMetrics?.month,
    selectedPeriod,
    handlePeriodChange,
    selectedDim,
    setSelectedDim,
    availableDays,
    totalDays,
    effectiveDay,
    setSelectedDay,
    series,
    previousMonth: dayMetrics?.previous_month
      ? { month: dayMetrics.previous_month, series: dayMetrics.previous_series }
      : undefined,
    dayCards,
    dayCharts: SUBS_DAY_CHARTS,
    projection,
    installedAtCutoff,
    projectedCompliance,
    globalData,
    currentDimensionData,
    campaigns,
    campaignsDay: dayCampaigns ? effectiveDay : 0,
  };
}
