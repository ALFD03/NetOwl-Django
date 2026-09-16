/**
 * Página Inertia `Support/Analytics` (`/support/analytics/`).
 *
 * La barra de días vuelve al servidor, a diferencia de la de Suscripciones: el
 * corte de un día de soporte lleva las métricas de cada grupo de trabajo por sus
 * seis ejes, así que el mes entero no viaja en los props. La vuelta es una
 * recarga parcial que lee una celda ya calculada — no recalcula nada.
 */

import { useCallback, useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { SupportAnalyticsFilters, SupportAnalyticsView, useSupportAnalytics } from '@/features/support';
import type { SupportAnalyticsProps, SupportDimension } from '@/features/support/types';
import { useDayCuts } from '@/shared/hooks/useDayCuts';
import { DayProgressBar } from '@/shared/ui';

export default function SupportAnalytics(props: SupportAnalyticsProps) {
  const { periods = [], selectedPeriod = '', dayMetrics } = props;
  const [selectedGroup, setSelectedGroup] = useState('');
  const [dimension, setDimension] = useState<SupportDimension>('zona');

  const data = useSupportAnalytics(props, selectedGroup, dimension);

  /** Un día es una recarga parcial: sólo el bloque del periodo y la barra. */
  const periodo = selectedPeriod || data.periodo;
  const pedirDia = useCallback(
    (dia: number) =>
      router.get('/support/analytics/', { period: periodo, dia }, {
        preserveState: true,
        preserveScroll: true,
        only: ['analyticsData', 'dayMetrics'],
      }),
    [periodo],
  );
  const { availableDays, totalDays, selectedDay, selectDay } = useDayCuts(dayMetrics, pedirDia);

  /** The period is the only server-side filter; group and dimension are local. */
  const reload = (period: string) =>
    router.get('/support/analytics/', { period }, { preserveState: true });

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
      <SupportAnalyticsView data={data} dimension={dimension} />
    </AppLayout>
  );
}
