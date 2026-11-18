/**
 * Página `/support/analytics/`.
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
 *
 * Lo que ATC escala a Soporte está dentro de las cifras de cada grupo: para ATC
 * es un cierre, para Soporte un ticket que le entra ese día. Por eso no hay un
 * bloque aparte de escalamiento: sigue al grupo y al día como todo lo demás.
 *
 * Esta página es de gráficos; las tablas completas del mes están en Results.
 */

import { useMemo, useState } from 'react';
import { CalendarDays, Layers } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import {
  Seccion,
  SeccionesNav,
  SUPPORT_DAY_CARDS,
  SUPPORT_DAY_CHARTS,
  SupportAnalyticsFilters,
  SupportAnalyticsView,
  useSupportAnalytics,
} from '@/features/support';
import type {
  SupportAnalyticsProps,
  SupportDayPayload,
  SupportDimension,
} from '@/features/support/types';
import { useDayCuts } from '@/shared/hooks/useDayCuts';
import { useDayPayload } from '@/shared/hooks/useDayPayload';
import { SUPPORT_DAY_METRICS_URL } from '@/shared/lib/api/support';
import type { DaySeries } from '@/shared/types/domain';
import { DayProgressBar, DaySummary } from '@/shared/ui';
import { useVisit } from '@/shared/page/PageData';

export default function SupportAnalytics(props: SupportAnalyticsProps) {
  const visit = useVisit();
  const { periods = [], selectedPeriod = '', dayMetrics } = props;
  const [selectedGroup, setSelectedGroup] = useState('');
  const [dimension, setDimension] = useState<SupportDimension>('zona');

  const { availableDays, totalDays, selectedDay, selectDay } = useDayCuts(dayMetrics);
  const periodo = selectedPeriod || props.analyticsData?.period || '';

  const { payload } = useDayPayload<SupportDayPayload>({
    url: SUPPORT_DAY_METRICS_URL,
    period: periodo,
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

  /** The period is the only server-side filter; group and dimension are local. */
  const reload = (period: string) =>
    visit({ period });

  // Las tarjetas del día siguen al selector de grupo, como el resto de la página.
  // El mes trae la serie de cada equipo, así que cambiar de grupo no pide nada.
  const groupSeries = useMemo<DaySeries | undefined>(() => {
    const byDay = dayMetrics?.group_series;
    if (!byDay || !data.activeGroupName) return undefined;

    const exit: DaySeries = {};
    for (const [dia, grupos] of Object.entries(byDay)) {
      const bloque = grupos[data.activeGroupName];
      if (bloque) exit[dia] = bloque;
    }
    // Un grupo aparece el día de su primer ticket y ya no desaparece: los días
    // anteriores no son un hueco, es que ese equipo todavía no tenía nada.
    return Object.keys(exit).length ? exit : undefined;
  }, [dayMetrics, data.activeGroupName]);

  return (
    <AppLayout
      toolbar={
        <>
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
                monthPeriod={dayMetrics?.month}
                daysInMonth={totalDays}
                selectedDay={selectedDay}
                onSelect={selectDay}
              />
            </div>
          )}
        </>
      }
    >
      <div className="space-y-10">
        <SeccionesNav
          sections={[
            { id: 'dia', title: 'El día', icon: <CalendarDays /> },
            { id: 'grupo', title: 'El grupo', icon: <Layers /> },
          ]}
        />

        <Seccion
          id="dia"
          title="El día"
          description="Lo de ese día, lo que va del mes y cómo se compara con el día anterior. Muévete con la barra de días."
          scope={
            data.activeGroupName ? `${data.activeGroupName} · día ${selectedDay || '—'}` : undefined
          }
          icon={<CalendarDays />}
        >
          <DaySummary
            serie={groupSeries ?? dayMetrics?.series}
            dias={availableDays}
            dia={selectedDay}
            cards={SUPPORT_DAY_CARDS}
            charts={SUPPORT_DAY_CHARTS}
            subtitle={
              groupSeries
                ? `${data.activeGroupName} · lo de ese día, lo que va del mes y cómo se compara con el día anterior`
                : 'Todos los grupos · este mes se analizó antes de que la serie se abriera por equipo'
            }
          />
        </Seccion>

        <Seccion
          id="grupo"
          title="El grupo"
          description="Cuánto entró y cómo terminó, en qué se fue el tiempo, dónde se concentra según la dimensión de la barra superior y qué lo empuja. Pulsa un valor para ver su desglose; las tablas completas están en Results."
          scope={
            data.activeGroupName
              ? `${data.activeGroupName} · al día ${selectedDay || '—'}`
              : undefined
          }
          icon={<Layers />}
        >
          <SupportAnalyticsView data={data} dimension={dimension} />
        </Seccion>

      </div>
    </AppLayout>
  );
}
