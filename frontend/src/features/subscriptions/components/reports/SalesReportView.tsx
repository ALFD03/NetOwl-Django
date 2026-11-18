/**
 * Sales Report: Site → Tecnología → Nodos, con subtotales por nivel. Cada site
 * abre con sus coordinadoras de oficina como insignias y un resumen sencillo del
 * site entero (instalaciones, objetivo, % Ingresos, % Ventas, proyección).
 */

import { Building2, Search } from 'lucide-react';

import type { Proyeccion } from '@/shared/lib/projection';
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
  diaSeleccionado?: boolean;
  /** Los días laborables del corte elegido, para proyectar las instalaciones al cierre. */
  projection?: Proyeccion | null;
  /** Las coordinadoras de oficina con site; cada bloque enseña las suyas. */
  coordinadoras?: OfficeCoordinator[];
  /** El día del corte, hasta el que se suman sus ventas; nulo es el mes entero. */
  cutoffDay?: number | null;
}

const siteKey = (nombre: string | undefined) => String(nombre ?? '').trim().toLowerCase();

export function SalesReportView({
  sites,
  period,
  diaSeleccionado = false,
  projection: proyeccion = null,
  coordinadoras = [],
  cutoffDay: diaCorte = null,
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
              <TargetGroup meta={site.meta} />
              <ChurnExportButton
                period={period}
                // Los nodos que el site tiene en pantalla, no los del catálogo:
                // los filtros de tecnología y sucursal ya recortaron la tabla.
                nodos={groupNodes(site.technologies?.flatMap((tech) => tech.nodes ?? []))}
                alcance={String(site.site ?? '')}
                dayNotice={diaSeleccionado}
                label="Exportar bajas del site"
              />
            </div>
          }
        >
          <div className="space-y-10">
            <OfficeCoordinatorBadges
              coordinadoras={coordinadoras.filter((c) => siteKey(c.site) === siteKey(site.site))}
              dia={diaCorte}
              // Pegadas al resumen del site, no a diez de distancia.
              className="-mb-6"
            />
            {site.totales && site.meta && (
              <SimpleSummary
                activeAtStart={site.totales.activos_inicio}
                activeAtEnd={site.totales.activos_final}
                nuevos={site.totales.nuevos}
                meta={site.meta}
                projection={proyeccion}
              />
            )}
            {site.technologies?.map((tech: SalesReportTechnology) => {
              if (!tech.dynamic) return null;

              return (
                <div key={tech.technology} className="space-y-4">
                  <CommercialSummaryStrip
                    leadLabel="Tecnología"
                    leadValue={String(tech.technology ?? '')}
                    activeAtStart={tech.dynamic.activos_inicio}
                    activeAtEnd={tech.dynamic.activos_final}
                    bajas={tech.dynamic.bajas}
                    crecimiento={tech.dynamic.crecimiento}
                    churnRate={tech.dynamic.churn_rate}
                    meta={tech.dynamic.meta}
                    nuevos={tech.dynamic.nuevos}
                    projection={proyeccion}
                  />

                  <div className="flex justify-end">
                    <ChurnExportButton
                      period={period}
                      nodos={groupNodes(tech.nodes)}
                      alcance={`${site.site ?? ''} ${tech.technology ?? ''}`}
                      dayNotice={diaSeleccionado}
                      label={`Exportar bajas ${tech.technology ?? ''}`}
                    />
                  </div>

                  <NodePerformanceTable
                    nodes={tech.nodes ?? []}
                    labelHeader="Nodo / Zona"
                    projection={proyeccion}
                    renderRowAction={(node) => (
                      <ChurnExportButton
                        period={period}
                        nodos={groupNodes([node])}
                        alcance={node.zona_sucursal ?? node.zona ?? ''}
                        dayNotice={diaSeleccionado}
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
