/**
 * El detalle de un mes en tablas: cada valor de cada eje con todas sus columnas,
 * la incidencia de cada zona y el desglose de un valor.
 *
 * Es lo que Analytics enseña en gráficos, para quien necesita leerlo fila a fila
 * o exportarlo. Lee el cierre del mes —sin barra de días— con los mismos hooks
 * que Analytics, así que las dos páginas no pueden dar cifras distintas.
 */

import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Layers } from 'lucide-react';

import { EmptyState } from '@/shared/ui';
import { useSupportAnalytics } from '../hooks/useSupportAnalytics';
import type { SupportAnalyticsProps, SupportDimension } from '../types';
import { SupportAnalyticsFilters } from './analytics/SupportAnalyticsFilters';
import { SupportBreakdownModal } from './analytics/SupportBreakdownModal';
import { SupportDimensionPanel } from './analytics/SupportDimensionPanel';
import { SupportIncidenceTable } from './analytics/SupportIncidenceTable';

interface Props {
  analyticsData?: SupportAnalyticsProps['analyticsData'];
  periods: string[];
  selectedPeriod: string;
}

export function SupportDetalleMes({ analyticsData, periods, selectedPeriod }: Props) {
  const [selectedGroup, setSelectedGroup] = useState('');
  const [dimension, setDimension] = useState<SupportDimension>('zona');

  const data = useSupportAnalytics({ analyticsData, periods, selectedPeriod }, selectedGroup, dimension);
  const { periodo, activeGroupName, hasGroups, dimensionRows, zonas, breakdown, openBreakdown, closeBreakdown } = data;

  // El histórico de arriba no cambia con el mes: sólo se pide el detalle.
  const cambiarMes = (period: string) =>
    router.get('/support/results/', { period }, { preserveState: true, preserveScroll: true, only: ['analyticsData', 'selectedPeriod'] });

  return (
    <div className="space-y-6">
      <SupportAnalyticsFilters
        periods={periods}
        selectedPeriod={periodo}
        onPeriodChange={cambiarMes}
        groups={data.groupOptions}
        selectedGroup={activeGroupName}
        onGroupChange={setSelectedGroup}
        selectedDimension={dimension}
        onDimensionChange={setDimension}
      />

      {!hasGroups ? (
        <EmptyState
          title="No hay datos de análisis disponibles para el periodo."
          description="Ejecuta el análisis del mes desde Importaciones para poblar las dimensiones de soporte."
          icon={<Layers />}
          bordered
        />
      ) : (
        <>
          {/* `key` remonta el panel al cambiar de eje, que es lo que descarta su
              estado local —la vista por departamento y el departamento filtrado—. */}
          <SupportDimensionPanel
            key={dimension}
            dimension={dimension}
            rows={dimensionRows}
            groupName={activeGroupName}
            periodo={periodo}
            onSelect={openBreakdown}
          />

          <SupportIncidenceTable rows={zonas} groupName={activeGroupName} />

          <SupportBreakdownModal
            dimension={dimension}
            breakdown={breakdown}
            groupName={activeGroupName}
            periodo={periodo}
            onClose={closeBreakdown}
          />
        </>
      )}
    </div>
  );
}
