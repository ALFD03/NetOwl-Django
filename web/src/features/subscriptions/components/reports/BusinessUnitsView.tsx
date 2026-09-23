/** Business Units: los nodos de cada coordinador y el bloque de radiofrecuencia. */

import {
  CircleArrowUp, CircleCheckBig, Ellipsis, Layers, Percent, Radio, Repeat,
  Target, TrendingDown, TrendingUp, User, UserCheck, UserRoundCheck, Users, Wrench,
} from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { MetricCard, NeonContainer } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { BajasExportButton } from './BajasExportButton';
import { CommercialSummaryStrip } from './CommercialSummaryStrip';
import { NodePerformanceTable } from './NodePerformanceTable';
import { useObjetivosConfig } from '../../hooks/useObjetivos';
import { nodosDeGrupo } from '../../lib/bajasExport';
import { completionTone } from '../../lib/commercial';
import { formatObjetivo, tonoChurn, tonoCrecimiento, tonoCumplimiento } from '../../lib/objetivos';
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
  const { semaforo } = useObjetivosConfig();
  // "Meta Cumplida" es llegar a la meta, no al umbral verde del semáforo: con
  // el verde en 90 se pintaría verde un grupo que todavía no la alcanzó.
  const met = summary.tasaCumplimiento >= 100;
  const ventasCumplimiento = summary.cumplimientoVentas;
  const cierreCumplimiento = summary.cumplimientoCierre;
  const tonoIngreso = tonoCumplimiento(summary.tasaCumplimiento, semaforo);
  const tonoVentas = tonoCumplimiento(ventasCumplimiento, semaforo);
  const tonoCierre = tonoCumplimiento(cierreCumplimiento, semaforo);

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
          <MetricCard label="Objetivo" value={formatInteger(summary.objetivo)} subValue={`${formatObjetivo(summary.meta.crecimientoPct)} de la base`} color="green" icon={<Target className="text-emerald-400" />} />
          <MetricCard label="Bajas" value={`- ${formatInteger(summary.bajas)}`} color="red" icon={<TrendingDown className="text-rose-400" />} />
          <MetricCard label="Activos Cierre" value={formatInteger(summary.activos_final)} color="slate" icon={<Users />} />
          <MetricCard label="Cierre Esperado" value={formatInteger(summary.cierreEsperado)} color="slate" icon={<UserRoundCheck />} />
          <MetricCard label="Faltante" value={formatInteger(summary.faltante)} color="yellow" icon={<Ellipsis className="text-amber-400" />} />
          <MetricCard
            label="Churn Rate"
            value={`${formatTwoDecimals(summary.churn_rate)} %`}
            subValue={`Objetivo ${formatObjetivo(summary.meta.churnPct)}`}
            color={tonoChurn(summary.churn_rate, semaforo)}
            icon={<Percent className="text-rose-400" />}
          />
          <MetricCard
            label="Crecimiento"
            value={`${formatTwoDecimals(summary.crecimiento)} %`}
            subValue={`Objetivo ${formatObjetivo(summary.meta.crecimientoPct)}`}
            color={tonoCrecimiento(summary.crecimiento, semaforo)}
            icon={<CircleArrowUp className="text-emerald-400" />}
          />
          <MetricCard
            label="Cumplimiento de Ingreso"
            value={`${formatTwoDecimals(summary.tasaCumplimiento)} %`}
            color={tonoIngreso}
            icon={<CircleCheckBig className={completionTone(summary.tasaCumplimiento, semaforo)} />}
          />
          <MetricCard
            label="Cumplimiento de Ventas"
            value={`${formatTwoDecimals(ventasCumplimiento)} %`}
            color={tonoVentas}
            icon={<CircleCheckBig className={completionTone(ventasCumplimiento, semaforo)} />}
          />
          <MetricCard
            label="Cumplimiento de Cierre"
            value={`${formatTwoDecimals(cierreCumplimiento)} %`}
            color={tonoCierre}
            icon={<CircleCheckBig className={completionTone(cierreCumplimiento, semaforo)} />}
          />
        </div>
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
}: BusinessUnitsViewProps) {
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
              headerAction={
                <BajasExportButton
                  period={period}
                  // El bloque RF no es un coordinador, pero se acota igual: por
                  // los nodos que tiene en pantalla.
                  nodos={nodosDeGrupo(group.nodes)}
                  alcance={group.coordinador}
                  avisoDia={diaSeleccionado}
                  label={isRf ? 'Exportar bajas RF' : 'Exportar bajas del coordinador'}
                />
              }
            >
              <div className="space-y-6">
                <CommercialSummaryStrip
                  leadLabel="Estado"
                  leadValue="Activo"
                  activosInicio={group.dynamic.activos_inicio}
                  activosFinal={group.dynamic.activos_final}
                  crecimiento={group.dynamic.crecimiento}
                  churnRate={group.dynamic.churn_rate}
                  bajas={group.dynamic.bajas}
                  meta={group.dynamic.meta}
                  mono
                />

                <NodePerformanceTable
                  nodes={group.nodes ?? []}
                  labelHeader="Zona / Sucursal"
                  renderBadge={(node) => <TechnologyBadge node={node} />}
                  mono
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
            </NeonContainer>
          );
        })}
      </div>
    </>
  );
}
