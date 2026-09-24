/**
 * Página Inertia `Support/Analytics` (`/support/analytics/`).
 *
 * Moverse por los días no cuesta una consulta. Lo que cambia sale de dos sitios:
 *
 * - las tarjetas y las líneas de tendencia, de `dayMetrics.serie_grupos` — el
 *   bloque global de los treinta y un días **abierto por equipo**, que ya viajó
 *   entero en los props. Toda esta página está filtrada por grupo y el selector
 *   no tiene un «todos», así que las tarjetas siguen al equipo elegido: unas
 *   cifras con el total de la empresa dirían otra cosa que el resto de la
 *   pantalla;
 * - el desglose dimensional, de la caché de `useDayPayload`, que adelanta los
 *   días vecinos y sólo pide el que falte.
 *
 * El mes completo con desgloses no viaja porque un solo día ya lleva las
 * métricas de cada grupo de trabajo por sus seis ejes.
 */

import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import {
  SUPPORT_DAY_CARDS,
  SUPPORT_DAY_CHARTS,
  SupportAnalyticsFilters,
  SupportAnalyticsView,
  useSupportAnalytics,
} from '@/features/support';
import type { SupportAnalyticsProps, SupportDayPayload, SupportDimension } from '@/features/support/types';
import { useDayCuts } from '@/shared/hooks/useDayCuts';
import { useDayPayload } from '@/shared/hooks/useDayPayload';
import { SUPPORT_DAY_METRICS_URL } from '@/shared/lib/api/support';
import type { DaySeries } from '@/shared/types/domain';
import { DayProgressBar, DaySummary } from '@/shared/ui';

export default function SupportAnalytics(props: SupportAnalyticsProps) {
  const { periods = [], selectedPeriod = '', dayMetrics } = props;
  const [selectedGroup, setSelectedGroup] = useState('');
  const [dimension, setDimension] = useState<SupportDimension>('zona');

  const { availableDays, totalDays, selectedDay, selectDay } = useDayCuts(dayMetrics);
  const periodo = selectedPeriod || props.analyticsData?.periodo || '';

  const { payload } = useDayPayload<SupportDayPayload>({
    url: SUPPORT_DAY_METRICS_URL,
    period: periodo,
    dia: selectedDay,
    dias: availableDays,
    // El día que la vista ya resolvió llega dentro de `analyticsData`: sembrarlo
    // evita pedir de vuelta lo que acaba de llegar.
    inicial: dayMetrics?.dia
      ? {
          dia: dayMetrics.dia,
          payload: {
            grupos: props.analyticsData?.grupos ?? {},
            incidencia_zonas: props.analyticsData?.incidencia_zonas ?? {},
          },
        }
      : null,
  });

  const data = useSupportAnalytics(
    {
      ...props,
      analyticsData: {
        ...props.analyticsData,
        grupos: payload?.grupos ?? props.analyticsData?.grupos,
        incidencia_zonas: payload?.incidencia_zonas ?? props.analyticsData?.incidencia_zonas,
      },
    },
    selectedGroup,
    dimension,
  );

  /** The period is the only server-side filter; group and dimension are local. */
  const reload = (period: string) =>
    router.get('/support/analytics/', { period }, { preserveState: true });

  // Las tarjetas del día siguen al selector de grupo, como el resto de la página.
  // El mes trae la serie de cada equipo, así que cambiar de grupo no pide nada.
  const serieDelGrupo = useMemo<DaySeries | undefined>(() => {
    const porDia = dayMetrics?.serie_grupos;
    if (!porDia || !data.activeGroupName) return undefined;

    const salida: DaySeries = {};
    for (const [dia, grupos] of Object.entries(porDia)) {
      const bloque = grupos[data.activeGroupName];
      if (bloque) salida[dia] = bloque;
    }
    // Un grupo aparece el día de su primer ticket y ya no desaparece: los días
    // anteriores no son un hueco, es que ese equipo todavía no tenía nada.
    return Object.keys(salida).length ? salida : undefined;
  }, [dayMetrics, data.activeGroupName]);

  return (
    <AppLayout
      title="Análisis de Soporte Técnico por Periodo"
      toolbar={
        <>
          <ModuleHeader module="support" activeTab="analytics" />
          <SupportAnalyticsFilters
            periods={periods}
            selectedPeriod={periodo}
            onPeriodChange={reload}
            groups={data.groupOptions}
            selectedGroup={data.activeGroupName}
            onGroupChange={setSelectedGroup}
            selectedDimension={dimension}
            onDimensionChange={setDimension}
          />
          {availableDays.length > 0 && (
            <div className="mb-8">
              <DayProgressBar
                availableDays={availableDays}
                periodoMes={dayMetrics?.periodo_mes}
                daysInMonth={totalDays}
                selectedDay={selectedDay}
                onSelect={selectDay}
              />
            </div>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <DaySummary
          serie={serieDelGrupo ?? dayMetrics?.serie}
          dias={availableDays}
          dia={selectedDay}
          cards={SUPPORT_DAY_CARDS}
          charts={SUPPORT_DAY_CHARTS}
          subtitle={
            serieDelGrupo
              ? `${data.activeGroupName} · lo de ese día, lo que va del mes y cómo se compara con el día anterior`
              : 'Todos los grupos · este mes se analizó antes de que la serie se abriera por equipo'
          }
        />

        <SupportAnalyticsView data={data} dimension={dimension} />
      </div>
    </AppLayout>
  );
}
