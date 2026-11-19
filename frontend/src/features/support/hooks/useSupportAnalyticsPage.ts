/**
 * Lo que necesita la página de Analytics de soporte: grupo, dimensión y día
 * elegidos, el desglose del día (de la caché de `useDayPayload`) y la serie del
 * grupo para las tarjetas.
 */

import { useMemo, useState } from 'react';

import { useDayCuts } from '@/shared/hooks/useDayCuts';
import { useDayPayload } from '@/shared/hooks/useDayPayload';
import { SUPPORT_DAY_METRICS_URL } from '@/shared/lib/api/support';
import { useVisit } from '@/shared/page/PageData';
import type { DaySeries } from '@/shared/types/domain';

import type { SupportAnalyticsProps, SupportDayCuts, SupportDayPayload, SupportDimension } from '../types';
import { useSupportAnalytics } from './useSupportAnalytics';

/**
 * La serie de un equipo, sacada de la del mes abierta por grupo.
 *
 * Un grupo aparece el día de su primer ticket y ya no desaparece: los días
 * anteriores no son un hueco, es que ese equipo todavía no tenía nada.
 */
function seriesOfGroup(
  byDay: SupportDayCuts['group_series'],
  group: string | null | undefined,
): DaySeries | undefined {
  if (!byDay || !group) return undefined;
  const exit: DaySeries = {};
  for (const [day, groups] of Object.entries(byDay)) {
    const block = groups[group];
    if (block) exit[day] = block;
  }
  return Object.keys(exit).length ? exit : undefined;
}

export function useSupportAnalyticsPage(props: SupportAnalyticsProps) {
  const visit = useVisit();
  const { selectedPeriod = '', dayMetrics } = props;
  const [selectedGroup, setSelectedGroup] = useState('');
  const [dimension, setDimension] = useState<SupportDimension>('zona');

  const { availableDays, totalDays, selectedDay, selectDay } = useDayCuts(dayMetrics);
  const period = selectedPeriod || props.analyticsData?.period || '';

  const { payload } = useDayPayload<SupportDayPayload>({
    url: SUPPORT_DAY_METRICS_URL,
    period,
    day: selectedDay,
    days: availableDays,
    // El día que la vista ya resolvió llega dentro de `analyticsData`: sembrarlo
    // evita pedir de vuelta lo que acaba de llegar.
    initial: dayMetrics?.day
      ? {
          day: dayMetrics.day,
          payload: {
            groups: props.analyticsData?.groups ?? {},
            zone_incidence: props.analyticsData?.zone_incidence ?? {},
          },
        }
      : null,
  });

  const data = useSupportAnalytics(
    {
      ...props,
      analyticsData: {
        ...props.analyticsData,
        groups: payload?.groups ?? props.analyticsData?.groups,
        zone_incidence: payload?.zone_incidence ?? props.analyticsData?.zone_incidence,
      },
    },
    selectedGroup,
    dimension,
  );

  // El periodo es el único filtro del servidor; grupo y dimensión son locales.
  const reload = (next: string) => visit({ period: next });

  // Las tarjetas del día siguen al selector de grupo, como el resto de la página.
  // El mes trae la serie de cada equipo, así que cambiar de grupo no pide nada.
  const groupSeries = useMemo(
    () => seriesOfGroup(dayMetrics?.group_series, data.activeGroupName),
    [dayMetrics, data.activeGroupName],
  );

  // La referencia del mes anterior se lee igual que el mes: por grupo si el mes
  // va por grupo, el total si no.
  const previous = useMemo(() => {
    if (!dayMetrics?.previous_month) return undefined;
    const series = groupSeries
      ? seriesOfGroup(dayMetrics.previous_group_series, data.activeGroupName)
      : dayMetrics.previous_series;
    return { month: dayMetrics.previous_month, series };
  }, [dayMetrics, groupSeries, data.activeGroupName]);

  return {
    periods: props.periods ?? [],
    period,
    reload,
    data,
    setSelectedGroup,
    dimension,
    setDimension,
    availableDays,
    totalDays,
    selectedDay,
    selectDay,
    monthPeriod: dayMetrics?.month,
    series: groupSeries ?? dayMetrics?.series,
    groupSeries,
    previous,
  };
}
