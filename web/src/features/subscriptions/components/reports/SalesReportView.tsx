/** Sales Report: Site → Tecnología → Nodos, con subtotales por nivel. */

import { Building2, Search } from 'lucide-react';

import { EmptyState, NeonContainer } from '@/shared/ui';
import { formatPeriodoLabel } from '@/shared/utils/formatters';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { NodePerformanceTable } from './NodePerformanceTable';
import type { SalesReportSite, SalesReportTechnology } from '../../hooks/useSalesReportData';

interface SalesReportViewProps {
  sites: SalesReportSite[];
  period: string;
}

export function SalesReportView({ sites, period }: SalesReportViewProps) {
  if (sites.length === 0) {
    return (
      <EmptyState
        title="No hay datos que coincidan con los filtros"
        icon={<Search />}
        size="lg"
        bordered
      />
    );
  }

  return (
    <div className="space-y-10">
      {sites.map((site) => (
        <NeonContainer
          key={site.site}
          theme="blue"
          title={site.site}
          subtitle={`Auditoría Regional de Cierre (${formatPeriodoLabel(period)})`}
          icon={<Building2 className="h-5 w-5" />}
        >
          <div className="space-y-10">
            {site.technologies?.map((tech: SalesReportTechnology) => {
              if (!tech.dynamic) return null;

              return (
                <div key={tech.technology} className="space-y-4">
                  <CommercialSummaryStrip
                    leadLabel="Tecnología"
                    leadValue={String(tech.technology ?? '')}
                    activosInicio={tech.dynamic.activos_inicio}
                    activosFinal={tech.dynamic.activos_final}
                    crecimiento={tech.dynamic.crecimiento}
                    churnRate={tech.dynamic.churn_rate}
                    clampCompletion
                  />

                  <NodePerformanceTable
                    nodes={tech.nodes ?? []}
                    labelHeader="Nodo / Zona"
                    clampCompletion
                  />
                </div>
              );
            })}
          </div>
        </NeonContainer>
      ))}
    </div>
  );
}
