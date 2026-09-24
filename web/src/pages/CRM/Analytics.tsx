/**
 * Página Inertia `CRM/Analytics` (`/crm/analytics/`).
 *
 * Recibe todas las dimensiones del periodo: el selector de dimensión es de
 * cliente y no debe costar una vuelta al servidor.
 *
 * La barra de días tampoco la cuesta. Lo que mueve la barra sale de dos sitios,
 * ninguno de ellos una consulta nueva:
 *
 * - las tarjetas y las líneas de tendencia, de `dayMetrics.serie` — el bloque
 *   global de los treinta y un días, que ya viajó entero en los props;
 * - el desglose dimensional, de la caché de `useDayPayload`, que adelanta los
 *   días vecinos y sólo pide el que falte.
 *
 * El mes completo con desgloses no viaja porque un solo día ya lleva el bloque
 * de cada vendedor, sucursal y campaña.
 */

import { useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import {
  CRM_DAY_CARDS,
  CRM_DAY_CHARTS,
  CrmAnalyticsFilters,
  CrmAnalyticsView,
  useCrmAnalytics,
} from '@/features/crm';
import type { CrmAnalyticsProps, CrmDayPayload } from '@/features/crm/types';
import type { CrmDimensionKey } from '@/shared/constants/labels';
import { useDayCuts } from '@/shared/hooks/useDayCuts';
import { useDayPayload } from '@/shared/hooks/useDayPayload';
import { CRM_DAY_METRICS_URL } from '@/shared/lib/api/crm';
import { DayProgressBar, DaySummary } from '@/shared/ui';

export default function CrmAnalytics(props: CrmAnalyticsProps) {
  const { periods = [], selectedPeriod = '', dayMetrics } = props;
  const [selectedDimension, setSelectedDimension] = useState<CrmDimensionKey>('sucursal');

  const { availableDays, totalDays, selectedDay, selectDay } = useDayCuts(dayMetrics);

  const { payload } = useDayPayload<CrmDayPayload>({
    url: CRM_DAY_METRICS_URL,
    period: selectedPeriod,
    dia: selectedDay,
    dias: availableDays,
    // El día que la vista ya resolvió llega en los props: sembrarlo evita pedir
    // de vuelta lo que acaba de llegar.
    inicial: dayMetrics?.dia
      ? {
          dia: dayMetrics.dia,
          payload: {
            global: props.globalData ?? {},
            dimensiones: props.dimensionsData ?? [],
          },
        }
      : null,
  });

  const { rows, globalData, healthCards, rankingCards } = useCrmAnalytics(
    {
      ...props,
      dimensionsData: payload?.dimensiones ?? props.dimensionsData,
      globalData: payload?.global ?? props.globalData,
    },
    selectedDimension,
  );

  /** Al cambiar de mes se suelta el día: el del mes anterior no significa nada aquí. */
  const handlePeriodChange = (period: string) =>
    router.get('/crm/analytics/', { period }, { preserveState: true });

  return (
    <AppLayout
      title="CRM Analytics"
      toolbar={
        <>
          <ModuleHeader module="crm" activeTab="analytics" />
          <CrmAnalyticsFilters
            periods={periods}
            selectedPeriod={selectedPeriod}
            onPeriodChange={handlePeriodChange}
            selectedDimension={selectedDimension}
            onDimensionChange={setSelectedDimension}
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
          serie={dayMetrics?.serie}
          dias={availableDays}
          dia={selectedDay}
          cards={CRM_DAY_CARDS}
          charts={CRM_DAY_CHARTS}
        />

        <CrmAnalyticsView
          globalData={globalData}
          rows={rows}
          healthCards={healthCards}
          rankingCards={rankingCards}
          selectedDimension={selectedDimension}
          selectedPeriod={selectedPeriod}
        />
      </div>
    </AppLayout>
  );
}
