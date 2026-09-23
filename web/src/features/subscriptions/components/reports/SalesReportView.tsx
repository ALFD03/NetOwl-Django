/** Sales Report: Site → Tecnología → Nodos, con subtotales por nivel. */

import { Building2, Search } from 'lucide-react';

import { EmptyState, NeonContainer } from '@/shared/ui';
import { formatPeriodoLabel } from '@/shared/utils/formatters';
import { BajasExportButton } from './BajasExportButton';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { NodePerformanceTable } from './NodePerformanceTable';
import { nodosDeGrupo } from '../../lib/bajasExport';
import type { SalesReportSite, SalesReportTechnology } from '../../hooks/useSalesReportData';

interface SalesReportViewProps {
  sites: SalesReportSite[];
  period: string;
  /**
   * Hay un día seleccionado en la barra de corte.
   *
   * El export de bajas es siempre el del cierre del mes; el botón lo avisa.
   */
  diaSeleccionado?: boolean;
}

export function SalesReportView({ sites, period, diaSeleccionado = false }: SalesReportViewProps) {
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
          headerAction={
            <BajasExportButton
              period={period}
              // Los nodos que el site tiene en pantalla, no los del catálogo:
              // los filtros de tecnología y sucursal ya recortaron la tabla.
              nodos={nodosDeGrupo(site.technologies?.flatMap((tech) => tech.nodes ?? []))}
              alcance={String(site.site ?? '')}
              avisoDia={diaSeleccionado}
              label="Exportar bajas del site"
            />
          }
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
                    bajas={tech.dynamic.bajas}
                    crecimiento={tech.dynamic.crecimiento}
                    churnRate={tech.dynamic.churn_rate}
                    meta={tech.dynamic.meta}
                    clampCompletion
                  />

                  <div className="flex justify-end">
                    <BajasExportButton
                      period={period}
                      nodos={nodosDeGrupo(tech.nodes)}
                      alcance={`${site.site ?? ''} ${tech.technology ?? ''}`}
                      avisoDia={diaSeleccionado}
                      label={`Exportar bajas ${tech.technology ?? ''}`}
                    />
                  </div>

                  <NodePerformanceTable
                    nodes={tech.nodes ?? []}
                    labelHeader="Nodo / Zona"
                    clampCompletion
                    renderRowAction={(node) => (
                      <BajasExportButton
                        period={period}
                        nodos={nodosDeGrupo([node])}
                        alcance={node.zona_sucursal ?? node.zona ?? ''}
                        avisoDia={diaSeleccionado}
                        iconOnly
                      />
                    )}
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
