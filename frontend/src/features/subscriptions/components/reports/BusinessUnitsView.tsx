/** Business Units: los nodos de cada coordinador y el bloque de radiofrecuencia. */

import {
  CircleArrowUp, CircleCheckBig, Ellipsis, Layers, Percent, Radio, Repeat,
  Target, TrendingDown, TrendingUp, User, UserCheck, UserRoundCheck, Users, Wrench,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import type { Proyeccion } from '@/shared/lib/projection';
import { MetricCard, NeonContainer } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { CloseProjection } from '../analytics/CloseProjection';
import { ChurnExportButton } from './ChurnExportButton';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { NodePerformanceTable } from './NodePerformanceTable';
import { TargetGroup } from './TargetGroup';
import { useTargetsConfig } from '../../hooks/useTargets';
import { groupNodes } from '../../lib/churnExport';
import { completionTone } from '../../lib/commercial';
import { formatTarget, tonoChurn, tonoCrecimiento, complianceTone } from '../../lib/targets';
import type {
  BusinessUnitGroup, BusinessUnitNode, FtthSummary,
} from '../../hooks/useBusinessUnitsData';

interface BusinessUnitsViewProps {
  groups: BusinessUnitGroup[];
  ftthSummary: FtthSummary;
  showFtthSummary: boolean;
  /** Etiqueta del cierre, para el export de bajas. */
  period: string;
  /**
   * Hay un día seleccionado en la barra de corte.
   *
   * El export de bajas es siempre el del cierre del mes; el botón lo avisa.
   */
  diaSeleccionado?: boolean;
  /** Los días laborables del corte elegido, para proyectar las instalaciones al cierre. */
  projection?: Proyeccion | null;
}

function TechnologyBadge({ node }: { node: BusinessUnitNode }) {
  const isRf = node.type === 'RF';
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 text-[9px] font-bold',
        isRf
          ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
          : 'border-brand/20 bg-brand/10 text-brand',
      )}
    >
      {isRf ? 'RF' : 'FTTH'}
    </span>
  );
}

function FtthConsolidated({ summary, projection: proyeccion }: { summary: FtthSummary; projection: Proyeccion | null }) {
  const { semaforo } = useTargetsConfig();
  // "Meta Cumplida" es llegar a la meta, no al umbral verde del semáforo: con
  // el verde en 90 se pintaría verde un grupo que todavía no la alcanzó.
  const met = summary.complianceRate >= 100;
  const salesCompliance = summary.salesCompliance;
  const closeCompliance = summary.closeCompliance;
  const tonoIngreso = complianceTone(summary.complianceRate, semaforo);
  const salesTone = complianceTone(salesCompliance, semaforo);
  const closeTone = complianceTone(closeCompliance, semaforo);

  return (
    <div className="mb-10">
      <NeonContainer
        theme="cyan"
        title="Consolidado General FTTH"
        subtitle={`Rendimiento global de todos los nodos de Fibra Óptica (${summary.total_nodos} nodos)`}
        icon={<Layers className="h-5 w-5" />}
        headerAction={
          <span
            className={cn(
              'rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-wider',
              met
                ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
                : 'border-amber-500/40 bg-amber-500/20 text-amber-400',
            )}
          >
            {met ? 'Meta Cumplida' : 'En Progreso'}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-7">
          <MetricCard label="Activos Inicio" value={formatInteger(summary.activos_inicio)} color="slate" icon={<User />} />
          <MetricCard label="Instalaciones" value={`+ ${formatInteger(summary.nuevos)}`} color="green" icon={<Wrench className="text-emerald-400" />} />
          <MetricCard label="Reactivaciones" value={`+ ${formatInteger(summary.reactivaciones)}`} color="blue" icon={<Repeat className="text-sky-400" />} />
          <MetricCard label="Ingresos Reales" value={`+ ${formatInteger(summary.adiciones_brutas)}`} color="purple" icon={<TrendingUp className="text-purple-400" />} />
          <MetricCard label="Objetivo" value={formatInteger(summary.objetivo)} subValue={`${formatTarget(summary.meta.growthPct)} de la base`} color="green" icon={<Target className="text-emerald-400" />} />
          <MetricCard label="Bajas" value={`- ${formatInteger(summary.bajas)}`} color="red" icon={<TrendingDown className="text-rose-400" />} />
          <MetricCard label="Activos Cierre" value={formatInteger(summary.activos_final)} color="slate" icon={<Users />} />
          <MetricCard label="Cierre Esperado" value={formatInteger(summary.expectedClose)} color="slate" icon={<UserRoundCheck />} />
          <MetricCard label="Faltante" value={formatInteger(summary.faltante)} color="yellow" icon={<Ellipsis className="text-amber-400" />} />
          <MetricCard
            label="Churn Rate"
            value={`${formatTwoDecimals(summary.churn_rate)} %`}
            subValue={`Objetivo ${formatTarget(summary.meta.churnPct)}`}
            color={tonoChurn(summary.churn_rate, semaforo)}
            icon={<Percent className="text-rose-400" />}
          />
          <MetricCard
            label="Crecimiento"
            value={`${formatTwoDecimals(summary.crecimiento)} %`}
            subValue={`Objetivo ${formatTarget(summary.meta.growthPct)}`}
            color={tonoCrecimiento(summary.crecimiento, semaforo)}
            icon={<CircleArrowUp className="text-emerald-400" />}
          />
          <MetricCard
            label="Cumplimiento de Ingreso"
            value={`${formatTwoDecimals(summary.complianceRate)} %`}
            color={tonoIngreso}
            icon={<CircleCheckBig className={completionTone(summary.complianceRate, semaforo)} />}
          />
          <MetricCard
            label="Cumplimiento de Ventas"
            value={`${formatTwoDecimals(salesCompliance)} %`}
            color={salesTone}
            icon={<CircleCheckBig className={completionTone(salesCompliance, semaforo)} />}
          />
          <MetricCard
            label="Cumplimiento de Cierre"
            value={`${formatTwoDecimals(closeCompliance)} %`}
            color={closeTone}
            icon={<CircleCheckBig className={completionTone(closeCompliance, semaforo)} />}
          />
        </div>

        {proyeccion && (
          // Aparte de las tarjetas del corte: esto no es lo que hay, es adónde
          // lleva el ritmo de los días laborables si sigue igual hasta el cierre.
          <div className="mt-6">
            <CloseProjection
              instalaciones={summary.nuevos}
              projection={proyeccion}
              cumplimiento={summary.projectedSalesCompliance === null ? null : {
                valor: summary.projectedSalesCompliance,
                objetivo: summary.objetivo,
                tono: complianceTone(summary.projectedSalesCompliance, semaforo),
              }}
            />
          </div>
        )}
      </NeonContainer>
    </div>
  );
}

export function BusinessUnitsView({
  groups,
  ftthSummary,
  showFtthSummary,
  period,
  diaSeleccionado = false,
  projection: proyeccion = null,
}: BusinessUnitsViewProps) {
  return (
    <>
      {showFtthSummary && ftthSummary.total_nodos > 0 && <FtthConsolidated summary={ftthSummary} projection={proyeccion} />}

      <div className="space-y-10">
        {groups.map((group) => {
          if (!group.dynamic) return null;
          const isRf = Boolean(group.is_rf);

          return (
            <NeonContainer
              key={group.coordinador}
              theme={isRf ? 'yellow' : 'blue'}
              title={group.coordinador}
              subtitle={`Gestión de Nodos y Crecimiento Comercial (${group.dynamic.total_nodos} zonas)`}
              icon={isRf ? <Radio className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
              headerAction={
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <TargetGroup meta={group.dynamic.meta} />
                  <ChurnExportButton
                    period={period}
                    // El bloque RF no es un coordinador, pero se acota igual: por
                    // los nodos que tiene en pantalla.
                    nodos={groupNodes(group.nodes)}
                    alcance={group.coordinador}
                    dayNotice={diaSeleccionado}
                    label={isRf ? 'Exportar bajas RF' : 'Exportar bajas del coordinador'}
                  />
                </div>
              }
            >
              <div className="space-y-6">
                <CommercialSummaryStrip
                  leadLabel="Estado"
                  leadValue="Activo"
                  activeAtStart={group.dynamic.activos_inicio}
                  activeAtEnd={group.dynamic.activos_final}
                  crecimiento={group.dynamic.crecimiento}
                  churnRate={group.dynamic.churn_rate}
                  bajas={group.dynamic.bajas}
                  meta={group.dynamic.meta}
                  nuevos={group.dynamic.nuevos}
                  projection={proyeccion}
                  mono
                />

                <NodePerformanceTable
                  nodes={group.nodes ?? []}
                  labelHeader="Zona / Sucursal"
                  renderBadge={(node) => <TechnologyBadge node={node} />}
                  mono
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
            </NeonContainer>
          );
        })}
      </div>
    </>
  );
}
