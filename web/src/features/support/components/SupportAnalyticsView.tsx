/** Analytics de soporte: grupos, dimensiones, incidencia y drill-down. */

import { Layers } from 'lucide-react';

import { EmptyState } from '@/shared/ui';
import type { SupportDimension } from '../types';
import type { useSupportAnalytics } from '../hooks/useSupportAnalytics';
import { SupportBreakdownModal } from './analytics/SupportBreakdownModal';
import { SupportDimensionPanel } from './analytics/SupportDimensionPanel';
import { SupportGroupOverview } from './analytics/SupportGroupOverview';
import { SupportIncidenceTable } from './analytics/SupportIncidenceTable';

interface Props {
  data: ReturnType<typeof useSupportAnalytics>;
  dimension: SupportDimension;
}

/** Presentation only — every number arrives resolved from `useSupportAnalytics`. */
export function SupportAnalyticsView({ data, dimension }: Props) {
  const {
    periodo, activeGroupName, hasGroups, stats, sharePct,
    dimensionRows, zonas, breakdown, openBreakdown, closeBreakdown,
  } = data;

  if (!hasGroups) {
    return (
      <EmptyState
        title="No hay datos de análisis disponibles para el periodo."
        description="Ejecuta el análisis del mes desde Importaciones para poblar las dimensiones de soporte."
        icon={<Layers />}
        bordered
      />
    );
  }

  return (
    <div className="space-y-6">
      <SupportGroupOverview
        groupName={activeGroupName}
        stats={stats}
        sharePct={sharePct}
      />

      {/*
        `key` remonta el panel al cambiar de eje, que es lo que descarta su
        estado local —la vista por departamento y el departamento filtrado—.
        Arrastrarlo de «Asignado a» a «Zona» dejaria un filtro aplicado sobre
        una dimension que no tiene departamentos.
      */}
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
    </div>
  );
}
