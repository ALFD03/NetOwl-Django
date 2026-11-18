/**
 * Sales Report: Site → Tecnología → Nodos, con subtotales por nivel. Cada site
 * abre con sus coordinadoras de oficina como insignias y un resumen sencillo del
 * site entero (instalaciones, objetivo, % Ingresos, % Ventas, proyección).
 */

import { Building2, Search } from 'lucide-react';

import type { Projection } from '@/shared/lib/projection';
import { EmptyState, NeonContainer } from '@/shared/ui';
import { formatPeriodLabel } from '@/shared/utils/formatters';
import { ChurnExportButton } from './ChurnExportButton';
import { CommercialSummaryStrip, SimpleSummary } from './CommercialSummaryStrip';
import { OfficeCoordinatorBadges, type OfficeCoordinator } from './OfficeCoordinatorBadges';
import { NodePerformanceTable } from './NodePerformanceTable';
import { TargetGroup } from './TargetGroup';
import { groupNodes } from '../../lib/churnExport';
import type { SalesReportSite, SalesReportTechnology } from '../../hooks/useSalesReportData';

interface SalesReportViewProps {
  sites: SalesReportSite[];
  period: string;
  /**
   * Hay un día seleccionado en la barra de corte.
   *
   * El export de bajas es siempre el del cierre del mes; el botón lo avisa.
   */
  selectedDay?: boolean;
  /** Los días laborables del corte elegido, para proyectar las instalaciones al cierre. */
  projection?: Projection | null;
  /** Las coordinadoras de oficina con site; cada bloque enseña las suyas. */
  coordinatorOffices?: OfficeCoordinator[];
  /** El día del corte, hasta el que se suman sus ventas; nulo es el mes entero. */
  cutoffDay?: number | null;
}

const siteKey = (name: string | undefined) => String(name ?? '').trim().toLowerCase();

export function SalesReportView({
  sites,
  period,
  selectedDay: selectedDay = false,
  projection: projection = null,
  coordinatorOffices: coordinatorOffices = [],
  cutoffDay: cutoffDay = null,
}: SalesReportViewProps) {
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
          subtitle={`Auditoría Regional de Cierre (${formatPeriodLabel(period)})`}
          icon={<Building2 className="h-5 w-5" />}
          headerAction={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <TargetGroup goal={site.goal} />
              <ChurnExportButton
                period={period}
                // Los nodos que el site tiene en pantalla, no los del catálogo:
                // los filtros de tecnología y sucursal ya recortaron la tabla.
                nodes={groupNodes(site.technologies?.flatMap((tech) => tech.nodes ?? []))}
                scope={String(site.site ?? '')}
                dayNotice={selectedDay}
                label="Exportar bajas del site"
              />
            </div>
          }
        >
          <div className="space-y-10">
            <OfficeCoordinatorBadges
              coordinatorOffices={coordinatorOffices.filter((c) => siteKey(c.site) === siteKey(site.site))}
              day={cutoffDay}
              // Pegadas al resumen del site, no a diez de distancia.
              className="-mb-6"
            />
            {site.totals && site.goal && (
              <SimpleSummary
                activeAtStart={site.totals.active_start}
                activeAtEnd={site.totals.active_end}
                new_subs={site.totals.new_subs}
                goal={site.goal}
                projection={projection}
              />
            )}
            {site.technologies?.map((tech: SalesReportTechnology) => {
              if (!tech.dynamic) return null;

              return (
                <div key={tech.technology} className="space-y-4">
                  <CommercialSummaryStrip
                    leadLabel="Tecnología"
                    leadValue={String(tech.technology ?? '')}
                    activeAtStart={tech.dynamic.active_start}
                    activeAtEnd={tech.dynamic.active_end}
                    churned={tech.dynamic.churned}
                    growth={tech.dynamic.growth}
                    churnRate={tech.dynamic.churn_rate}
                    goal={tech.dynamic.goal}
                    new_subs={tech.dynamic.new_subs}
                    projection={projection}
                  />

                  <div className="flex justify-end">
                    <ChurnExportButton
                      period={period}
                      nodes={groupNodes(tech.nodes)}
                      scope={`${site.site ?? ''} ${tech.technology ?? ''}`}
                      dayNotice={selectedDay}
                      label={`Exportar bajas ${tech.technology ?? ''}`}
                    />
                  </div>

                  <NodePerformanceTable
                    nodes={tech.nodes ?? []}
                    labelHeader="Nodo / Zona"
                    projection={projection}
                    renderRowAction={(node) => (
                      <ChurnExportButton
                        period={period}
                        nodes={groupNodes([node])}
                        scope={node.zona_sucursal ?? node.zona ?? ''}
                        dayNotice={selectedDay}
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
