import {
  CircleArrowUp, CircleCheckBig, Ellipsis, Layers, Percent, Radio, Repeat,
  Target, TrendingDown, TrendingUp, User, UserCheck, UserRoundCheck, Users, Wrench,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { MetricCard, NeonContainer } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { NodePerformanceTable } from './NodePerformanceTable';
import { completionTone } from '../../lib/commercial';
import type {
  BusinessUnitGroup, BusinessUnitNode, FtthSummary,
} from '../../hooks/useBusinessUnitsData';

interface BusinessUnitsViewProps {
  groups: BusinessUnitGroup[];
  ftthSummary: FtthSummary;
  showFtthSummary: boolean;
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

function FtthConsolidated({ summary }: { summary: FtthSummary }) {
  const met = summary.tasaCumplimiento >= 100;

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
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-6">
          <MetricCard label="Activos Inicio" value={formatInteger(summary.activos_inicio)} color="slate" icon={<User />} />
          <MetricCard label="Instalaciones" value={`+ ${formatInteger(summary.nuevos)}`} color="green" icon={<Wrench className="text-emerald-400" />} />
          <MetricCard label="Reactivaciones" value={`+ ${formatInteger(summary.reactivaciones)}`} color="blue" icon={<Repeat className="text-sky-400" />} />
          <MetricCard label="Ingresos Reales" value={`+ ${formatInteger(summary.adiciones_brutas)}`} color="purple" icon={<TrendingUp className="text-purple-400" />} />
          <MetricCard label="Objetivo" value={formatInteger(summary.objetivo)} color="green" icon={<Target className="text-emerald-400" />} />
          <MetricCard label="Bajas" value={`- ${formatInteger(summary.bajas)}`} color="red" icon={<TrendingDown className="text-rose-400" />} />
          <MetricCard label="Activos Cierre" value={formatInteger(summary.activos_final)} color="slate" icon={<Users />} />
          <MetricCard label="Cierre Esperado" value={formatInteger(summary.cierreEsperado)} color="slate" icon={<UserRoundCheck />} />
          <MetricCard label="Faltante" value={formatInteger(summary.faltante)} color="yellow" icon={<Ellipsis className="text-amber-400" />} />
          <MetricCard label="Churn Rate" value={`${formatTwoDecimals(summary.churn_rate)} %`} color="red" icon={<Percent className="text-rose-400" />} />
          <MetricCard label="Crecimiento" value={`${formatTwoDecimals(summary.crecimiento)} %`} color="green" icon={<CircleArrowUp className="text-emerald-400" />} />
          <MetricCard
            label="Tasa de Cumplimiento"
            value={`${formatTwoDecimals(summary.tasaCumplimiento)} %`}
            color={summary.tasaCumplimiento >= 100 ? 'green' : summary.tasaCumplimiento >= 80 ? 'yellow' : 'red'}
            icon={<CircleCheckBig className={completionTone(summary.tasaCumplimiento)} />}
          />
        </div>
      </NeonContainer>
    </div>
  );
}

export function BusinessUnitsView({ groups, ftthSummary, showFtthSummary }: BusinessUnitsViewProps) {
  return (
    <>
      {showFtthSummary && ftthSummary.total_nodos > 0 && <FtthConsolidated summary={ftthSummary} />}

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
            >
              <div className="space-y-6">
                <CommercialSummaryStrip
                  leadLabel="Estado"
                  leadValue="Activo"
                  activosInicio={group.dynamic.activos_inicio}
                  activosFinal={group.dynamic.activos_final}
                  crecimiento={group.dynamic.crecimiento}
                  churnRate={group.dynamic.churn_rate}
                  mono
                />

                <NodePerformanceTable
                  nodes={group.nodes ?? []}
                  labelHeader="Zona / Sucursal"
                  renderBadge={(node) => <TechnologyBadge node={node} />}
                  mono
                />
              </div>
            </NeonContainer>
          );
        })}
      </div>
    </>
  );
}
