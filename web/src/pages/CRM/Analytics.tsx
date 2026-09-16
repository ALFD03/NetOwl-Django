/**
 * Página Inertia `CRM/Analytics` (`/crm/analytics/`).
 *
 * Recibe todas las dimensiones del periodo: el selector de dimensión es de
 * cliente y no debe costar una vuelta al servidor.
 *
 * La barra de días sí vuelve al servidor, a diferencia de la de Suscripciones:
 * el corte de un día de CRM lleva el bloque completo de cada vendedor, sucursal
 * y campaña, así que el mes entero no viaja en los props. La vuelta es una
 * recarga parcial que lee una celda ya calculada — no recalcula nada.
 */

import { useCallback, useState } from 'react';
import { router } from '@inertiajs/react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { CrmAnalyticsFilters, CrmAnalyticsView, useCrmAnalytics } from '@/features/crm';
import type { CrmAnalyticsProps } from '@/features/crm/types';
import type { CrmDimensionKey } from '@/shared/constants/labels';
import { useDayCuts } from '@/shared/hooks/useDayCuts';
import { DayProgressBar } from '@/shared/ui';

export default function CrmAnalytics(props: CrmAnalyticsProps) {
  const { periods = [], selectedPeriod = '', dayMetrics } = props;
  const [selectedDimension, setSelectedDimension] = useState<CrmDimensionKey>('sucursal');

  const { rows, globalData, healthCards, rankingCards } = useCrmAnalytics(props, selectedDimension);

  const pedirDia = useCallback(
    (dia: number) =>
      router.get('/crm/analytics/', { period: selectedPeriod, dia }, {
        preserveState: true,
        preserveScroll: true,
        only: ['dimensionsData', 'globalData', 'dayMetrics'],
      }),
    [selectedPeriod],
  );
  const { availableDays, totalDays, selectedDay, selectDay } = useDayCuts(dayMetrics, pedirDia);

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
      <CrmAnalyticsView
        globalData={globalData}
        rows={rows}
        healthCards={healthCards}
        rankingCards={rankingCards}
        selectedDimension={selectedDimension}
        selectedPeriod={selectedPeriod}
      />
    </AppLayout>
  );
}
