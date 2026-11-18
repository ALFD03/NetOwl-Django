/** Business Units: los nodos de cada coordinador y el bloque de radiofrecuencia. */

import {
  CircleArrowUp, CircleCheckBig, Ellipsis, Layers, Percent, Radio, Repeat,
  Target, TrendingDown, TrendingUp, User, UserCheck, UserRoundCheck, Users, Wrench,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import type { Projection } from '@/shared/lib/projection';
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
import { formatTarget, churnTone, growthTone, complianceTone } from '../../lib/targets';
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
  selectedDay?: boolean;
  /** Los días laborables del corte elegido, para proyectar las instalaciones al cierre. */
  projection?: Projection | null;
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

function FtthConsolidated({ summary, projection }: { summary: FtthSummary; projection: Projection | null }) {
  const { thresholds } = useTargetsConfig();
  // "Meta Cumplida" es llegar a la meta, no al umbral verde del semáforo: con
  // el verde en 90 se pintaría verde un grupo que todavía no la alcanzó.
  const met = summary.complianceRate >= 100;
  const salesCompliance = summary.salesCompliance;
  const closeCompliance = summary.closeCompliance;
  const inflowTone = complianceTone(summary.complianceRate, thresholds);
  const salesTone = complianceTone(salesCompliance, thresholds);
  const closeTone = complianceTone(closeCompliance, thresholds);

  return (
    <div className="mb-10">
      <NeonContainer
        theme="cyan"
        title="Consolidado General FTTH"
        subtitle={`Rendimiento global de todos los nodos de Fibra Óptica (${summary.total_nodes} nodos)`}
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
          <MetricCard label="Activos Inicio" value={formatInteger(summary.active_start)} color="slate" icon={<User />} />
          <MetricCard label="Instalaciones" value={`+ ${formatInteger(summary.new_subs)}`} color="green" icon={<Wrench className="text-emerald-400" />} />
          <MetricCard label="Reactivaciones" value={`+ ${formatInteger(summary.reactivations)}`} color="blue" icon={<Repeat className="text-sky-400" />} />
          <MetricCard label="Ingresos Reales" value={`+ ${formatInteger(summary.gross_adds)}`} color="purple" icon={<TrendingUp className="text-purple-400" />} />
          <MetricCard label="Objetivo" value={formatInteger(summary.target)} subValue={`${formatTarget(summary.goal.growthPct)} de la base`} color="green" icon={<Target className="text-emerald-400" />} />
          <MetricCard label="Bajas" value={`- ${formatInteger(summary.churned)}`} color="red" icon={<TrendingDown className="text-rose-400" />} />
          <MetricCard label="Activos Cierre" value={formatInteger(summary.active_end)} color="slate" icon={<Users />} />
          <MetricCard label="Cierre Esperado" value={formatInteger(summary.expectedClose)} color="slate" icon={<UserRoundCheck />} />
          <MetricCard label="Faltante" value={formatInteger(summary.shortfall)} color="yellow" icon={<Ellipsis className="text-amber-400" />} />
          <MetricCard
            label="Churn Rate"
            value={`${formatTwoDecimals(summary.churn_rate)} %`}
            subValue={`Objetivo ${formatTarget(summary.goal.churnPct)}`}
            color={churnTone(summary.churn_rate, thresholds)}
            icon={<Percent className="text-rose-400" />}
          />
          <MetricCard
            label="Crecimiento"
            value={`${formatTwoDecimals(summary.growth)} %`}
            subValue={`Objetivo ${formatTarget(summary.goal.growthPct)}`}
            color={growthTone(summary.growth, thresholds)}
            icon={<CircleArrowUp className="text-emerald-400" />}
          />
          <MetricCard
            label="Cumplimiento de Ingreso"
            value={`${formatTwoDecimals(summary.complianceRate)} %`}
            color={inflowTone}
            icon={<CircleCheckBig className={completionTone(summary.complianceRate, thresholds)} />}
          />
          <MetricCard
            label="Cumplimiento de Ventas"
            value={`${formatTwoDecimals(salesCompliance)} %`}
            color={salesTone}
            icon={<CircleCheckBig className={completionTone(salesCompliance, thresholds)} />}
          />
          <MetricCard
            label="Cumplimiento de Cierre"
            value={`${formatTwoDecimals(closeCompliance)} %`}
            color={closeTone}
            icon={<CircleCheckBig className={completionTone(closeCompliance, thresholds)} />}
          />
        </div>

        {projection && (
          // Aparte de las tarjetas del corte: esto no es lo que hay, es adónde
          // lleva el ritmo de los días laborables si sigue igual hasta el cierre.
          <div className="mt-6">
            <CloseProjection
              installs={summary.new_subs}
              projection={projection}
              compliance={summary.projectedSalesCompliance === null ? null : {
                value: summary.projectedSalesCompliance,
                target: summary.target,
                tone: complianceTone(summary.projectedSalesCompliance, thresholds),
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
  selectedDay: selectedDay = false,
  projection: projection = null,
}: BusinessUnitsViewProps) {
  return (
    <>
      {showFtthSummary && ftthSummary.total_nodes > 0 && <FtthConsolidated summary={ftthSummary} projection={projection} />}

      <div className="space-y-10">
        {groups.map((group) => {
          if (!group.dynamic) return null;
          const isRf = Boolean(group.is_rf);

          return (
            <NeonContainer
              key={group.coordinator}
              theme={isRf ? 'yellow' : 'blue'}
              title={group.coordinator}
              subtitle={`Gestión de Nodos y Crecimiento Comercial (${group.dynamic.total_nodes} zonas)`}
              icon={isRf ? <Radio className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
              headerAction={
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <TargetGroup goal={group.dynamic.goal} />
                  <ChurnExportButton
                    period={period}
                    // El bloque RF no es un coordinador, pero se acota igual: por
                    // los nodos que tiene en pantalla.
                    nodes={groupNodes(group.nodes)}
                    scope={group.coordinator}
                    dayNotice={selectedDay}
                    label={isRf ? 'Exportar bajas RF' : 'Exportar bajas del coordinador'}
                  />
                </div>
              }
            >
              <div className="space-y-6">
                <CommercialSummaryStrip
                  leadLabel="Estado"
                  leadValue="Activo"
                  activeAtStart={group.dynamic.active_start}
                  activeAtEnd={group.dynamic.active_end}
                  growth={group.dynamic.growth}
                  churnRate={group.dynamic.churn_rate}
                  churned={group.dynamic.churned}
                  goal={group.dynamic.goal}
                  new_subs={group.dynamic.new_subs}
                  projection={projection}
                  mono
                />

                <NodePerformanceTable
                  nodes={group.nodes ?? []}
                  labelHeader="Zona / Sucursal"
                  renderBadge={(node) => <TechnologyBadge node={node} />}
                  mono
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
            </NeonContainer>
          );
        })}
      </div>
    </>
  );
}
