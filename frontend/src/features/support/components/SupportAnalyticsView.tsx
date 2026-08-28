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
    activeGroupName, hasGroups, stats, sharePct,
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

      <SupportDimensionPanel
        dimension={dimension}
        rows={dimensionRows}
        onSelect={openBreakdown}
      />

      <SupportIncidenceTable rows={zonas} />

      <SupportBreakdownModal
        dimension={dimension}
        breakdown={breakdown}
        onClose={closeBreakdown}
      />
    </div>
  );
}
