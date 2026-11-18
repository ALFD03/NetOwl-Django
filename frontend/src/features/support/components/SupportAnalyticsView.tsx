/**
 * Analytics de soporte: el grupo de un vistazo y lo que empuja sus cifras.
 *
 * Todo en gráficos. Las tablas completas —cada valor de cada eje con todas sus
 * columnas, cada zona— viven en Results (`SupportMonthDetail`), adonde enlazan
 * los paneles.
 */

import { Layers } from 'lucide-react';

import { usePermissions } from '@/shared/hooks/usePermissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { EmptyState } from '@/shared/ui';
import type { SupportDimension } from '../types';
import type { useSupportAnalytics } from '../hooks/useSupportAnalytics';
import { SupportBreakdownModal } from './analytics/SupportBreakdownModal';
import { SupportDimensionChart } from './analytics/SupportDimensionChart';
import { SupportDriversPanel } from './analytics/SupportDriversPanel';
import { SupportGroupOverview } from './analytics/SupportGroupOverview';
import { SupportIncidenceChart } from './analytics/SupportIncidenceChart';

interface Props {
  data: ReturnType<typeof useSupportAnalytics>;
  dimension: SupportDimension;
}

/** Presentation only — every number arrives resolved from `useSupportAnalytics`. */
export function SupportAnalyticsView({ data, dimension }: Props) {
  const {
    period, activeGroupName, activeGroup, hasGroups, stats, sharePct,
    dimensionRows, zones, breakdown, openBreakdown, closeBreakdown,
  } = data;
  const { can } = usePermissions();
  const resultsHref = can(PERMISSIONS.VIEW_SUPPORT_RESULTS) && period
    ? `/support/results/?period=${encodeURIComponent(period)}#detalle`
    : undefined;

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
      <SupportGroupOverview groupName={activeGroupName} stats={stats} sharePct={sharePct} />

      {/* `key` remonta el panel al cambiar de eje: la lectura por departamento
          no tiene sentido en un eje que no es de personas. */}
      <SupportDimensionChart
        key={dimension}
        dimension={dimension}
        rows={dimensionRows}
        groupName={activeGroupName}
        onSelect={openBreakdown}
        resultsHref={resultsHref}
      />

      {/* Cada uno en su fila: lado a lado, el más alto estiraba al otro y lo
          dejaba con media tarjeta vacía. */}
      <SupportDriversPanel group={activeGroup} />
      <SupportIncidenceChart rows={zones} groupName={activeGroupName} resultsHref={resultsHref} />

      <SupportBreakdownModal
        dimension={dimension}
        breakdown={breakdown}
        groupName={activeGroupName}
        period={period}
        onClose={closeBreakdown}
      />
    </div>
  );
}
