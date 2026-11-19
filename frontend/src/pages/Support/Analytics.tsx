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

import { CalendarDays, Layers } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import {
  Section,
  SectionsNav,
  SUPPORT_DAY_CARDS,
  SUPPORT_DAY_CHARTS,
  SupportAnalyticsFilters,
  SupportAnalyticsView,
} from '@/features/support';
import { useSupportAnalyticsPage } from '@/features/support/hooks/useSupportAnalyticsPage';
import type { SupportAnalyticsProps } from '@/features/support/types';
import { DayProgressBar, DaySummary } from '@/shared/ui';

export default function SupportAnalytics(props: SupportAnalyticsProps) {
  const {
    periods, period, reload, data, setSelectedGroup, dimension, setDimension,
    availableDays, totalDays, selectedDay, selectDay, monthPeriod, series, groupSeries, previous,
  } = useSupportAnalyticsPage(props);

  return (
    <AppLayout
      toolbar={
        <>
          <SupportAnalyticsFilters
            periods={periods}
            selectedPeriod={period}
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
                monthPeriod={monthPeriod}
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
        <SectionsNav
          sections={[
            { id: 'dia', title: 'El día', icon: <CalendarDays /> },
            { id: 'grupo', title: 'El grupo', icon: <Layers /> },
          ]}
        />

        <Section
          id="dia"
          title="El día"
          description="Lo de ese día, lo que va del mes y cómo se compara con el día anterior. Muévete con la barra de días."
          scope={
            data.activeGroupName ? `${data.activeGroupName} · día ${selectedDay || '—'}` : undefined
          }
          icon={<CalendarDays />}
        >
          <DaySummary
            series={series}
            days={availableDays}
            day={selectedDay}
            cards={SUPPORT_DAY_CARDS}
            charts={SUPPORT_DAY_CHARTS}
            previous={previous}
            subtitle={
              groupSeries
                ? `${data.activeGroupName} · lo de ese día, lo que va del mes y cómo se compara con el día anterior`
                : 'Todos los grupos · este mes se analizó antes de que la serie se abriera por equipo'
            }
          />
        </Section>

        <Section
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
        </Section>

      </div>
    </AppLayout>
  );
}
