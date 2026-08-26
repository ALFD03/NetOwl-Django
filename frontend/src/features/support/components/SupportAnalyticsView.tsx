import { Layers } from 'lucide-react';

import { EmptyState } from '@/shared/ui';
import type { useSupportAnalytics } from '../hooks/useSupportAnalytics';
import { SupportBreakdownPanel } from './analytics/SupportBreakdownPanel';
import { SupportGroupOverview } from './analytics/SupportGroupOverview';
import { SupportIncidenceTable } from './analytics/SupportIncidenceTable';

interface Props {
  data: ReturnType<typeof useSupportAnalytics>;
}

/** Presentation only — every number arrives resolved from `useSupportAnalytics`. */
export function SupportAnalyticsView({ data }: Props) {
  const { activeGroupName, hasGroups, stats, razones, soluciones, tipos, sucursales, zonas } = data;

  if (!hasGroups) {
    return (
      <EmptyState
        title="No hay datos de análisis disponibles para el periodo."
        description="Ejecuta el análisis del mes desde Resultados para poblar las dimensiones de soporte."
        icon={<Layers />}
        bordered
      />
    );
  }

  return (
    <div className="space-y-6">
      <SupportGroupOverview groupName={activeGroupName} stats={stats} />

      <SupportBreakdownPanel
        razones={razones}
        soluciones={soluciones}
        tipos={tipos}
        sucursales={sucursales}
      />

      <SupportIncidenceTable rows={zonas} />
    </div>
  );
}
