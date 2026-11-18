/** La tabla de nodos de los dos reportes comerciales, con su objetivo y sus tres cumplimientos. */

import type { ReactNode } from 'react';
import { Gauge, RefreshCw, TrendingUp } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Pagination, usePagination } from '@/shared/ui';
import type { Projection } from '@/shared/lib/projection';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useTargetsConfig } from '../../hooks/useTargets';
import {
  calcCommercial,
  completionBar,
  completionTone,
  type CommercialNode,
} from '../../lib/commercial';
import {
  DEFAULT_TARGETS,
  TONE_TEXT,
  formatTarget,
  baseGoal,
  overallTarget,
  churnTone,
  growthTone,
} from '../../lib/targets';
import type { TargetsTrafficLight } from '../../types';
import { TARGET_LEVEL_UI } from '../targets/levels';

export interface NodePerformanceTableProps<T extends CommercialNode> {
  nodes: T[];
  /** Header for the first column — the reports label their rows differently. */
  labelHeader: string;
  /** Optional chip before the row label, e.g. the FTTH/RF technology badge. */
  renderBadge?: (node: T) => ReactNode;
  /** Tabular figures on every numeric cell. */
  mono?: boolean;
  /**
   * Acción al final de cada fila, p. ej. exportar las bajas de esa zona.
   *
   * La columna solo aparece cuando se pasa: la tabla la comparten los dos
   * reportes y no todos sus usos tienen algo que poner ahí.
   */
  renderRowAction?: (node: T) => ReactNode;
  /**
   * Los días laborables del corte elegido. Con ellos aparece la columna de
   * proyección: las instalaciones al ritmo actual hasta el cierre del mes.
   */
  projection?: Projection | null;
}

/**
 * El objetivo de un nodo, a la vista: el porcentaje grande, la meta en altas
 * netas y de qué nivel sale (el nodo, su zona, su sucursal, su coordinador...).
 * Solo se enseña: los objetivos se editan en el catálogo.
 */
function TargetBadge({
  percentage,
  goal,
  source,
  expectedClose,
  mono,
  withoutTarget: withoutTarget = false,
}: {
  withoutTarget?: boolean;
  percentage: number;
  goal: number;
  source?: CommercialNode['targetSource'];
  expectedClose: number;
  mono: boolean;
}) {
  if (withoutTarget) {
    return (
      <div className="flex flex-col items-end" title="Zona sin objetivo: no cuenta para el cumplimiento de su grupo. Se cambia en Catálogos › Ventas › Objetivos.">
        <span className="rounded border border-slate-600 bg-slate-800/60 px-1.5 py-px text-[9px] font-black uppercase text-slate-300">
          Sin objetivo
        </span>
      </div>
    );
  }
  const ui = TARGET_LEVEL_UI[source?.level ?? 'general'];
  const content = (
    <>
      <span className="flex items-baseline gap-1.5">
        <span className={cn('text-sm font-black text-sky-300', mono && 'font-mono')}>{formatTarget(percentage)}</span>
        <span className={cn('text-[10px] font-bold text-slate-400', mono && 'font-mono')}>+{formatInteger(goal)}</span>
      </span>
      <span className={cn('mt-0.5 max-w-[140px] truncate rounded border px-1.5 py-px text-[9px] font-black uppercase', ui.chip)}>
        {ui.short}{source?.name && source.level !== 'zona_sucursal' ? ` ${source.name}` : ''}
      </span>
    </>
  );
  const title = `Objetivo ${formatTarget(percentage)} (${ui.label.toLowerCase()}${source?.name ? ` ${source.name}` : ''}) · cierre esperado ${formatInteger(expectedClose)}`;

  return <div className="flex flex-col items-end" title={title}>{content}</div>;
}

/** Un cumplimiento: el porcentaje con el color del semáforo y una barra de progreso. */
function ComplianceCell({
  value,
  thresholds,
  mono,
}: {
  /** Nulo: la fila no tiene contra qué medirse (zona sin objetivo). */
  value: number | null;
  thresholds: TargetsTrafficLight;
  mono: boolean;
}) {
  if (value === null) return <td className="py-3 text-right text-slate-600">—</td>;
  return (
    <td className="py-3 text-right">
      <div className="flex flex-col items-end">
        <span className={cn('font-black', mono && 'font-mono', completionTone(value, thresholds))}>
          {formatTwoDecimals(value)}%
        </span>
        <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn('h-full', completionBar(value, thresholds))}
            style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
          />
        </div>
      </div>
    </td>
  );
}

/** Las instalaciones proyectadas al cierre y el cumplimiento de ventas que darían. */
function ProjectionCell({
  installs,
  compliance,
  thresholds,
  mono,
}: {
  installs: number | null;
  compliance: number | null;
  thresholds: TargetsTrafficLight;
  mono: boolean;
}) {
  if (installs === null) return <td className="py-3 text-right text-slate-600">—</td>;

  return (
    <td className="py-3 text-right">
      <div className="flex flex-col items-end">
        <span className={cn('font-black text-cyan-300', mono && 'font-mono')}>{formatInteger(installs)}</span>
        {compliance !== null && (
          <span
            className={cn('text-[10px] font-bold', mono && 'font-mono', completionTone(compliance, thresholds))}
            title="Cumplimiento de ventas proyectado al cierre"
          >
            {formatTwoDecimals(compliance)}% obj.
          </span>
        )}
      </div>
    </td>
  );
}

/**
 * Per-node commercial performance table.
 *
 * `SalesReport` and `BusinessUnits` each carried a verbatim copy of this
 * table; they now differ only by `labelHeader`, `renderBadge` and `mono`.
 *
 * Cada fila enseña su objetivo —la meta absoluta y el porcentaje que la
 * produce, que puede ser propio de la zona— y los tres cumplimientos contra
 * ella: ingreso (crecimiento neto), ventas (instalaciones) y cierre (base
 * final contra la esperada). Con un día de corte elegido, además, la
 * proyección de las instalaciones al cierre (ver `shared/lib/projection`).
 */
export function NodePerformanceTable<T extends CommercialNode>({
  nodes,
  labelHeader,
  renderBadge,
  mono = false,
  renderRowAction,
  projection: projection = null,
}: NodePerformanceTableProps<T>) {
  const { thresholds } = useTargetsConfig();
  const num = (extra?: string) => cn('py-3 text-right', mono && 'font-mono', extra);
  const pagination = usePagination(nodes);

  return (
    <div>
      <Pagination state={pagination} position="arriba" className="mb-2" />
      <div className="overflow-x-auto">
        {/* `whitespace-nowrap`: en un teléfono la tabla se desliza en vez de
            partir cada cifra en dos líneas. La primera columna queda fijada. */}
        <table className="w-full whitespace-nowrap border-separate border-spacing-0 text-left [&_td:not(:first-child)]:pl-3 [&_th:not(:first-child)]:pl-3">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              <th className="sticky left-0 z-10 bg-surface-secondary pb-3 pl-2 pr-3">{labelHeader}</th>
              <th className="pb-3 text-right">Inicio</th>
              <th className="pb-3 text-right text-emerald-500">
                <TrendingUp className="mr-1 inline h-3 w-3" />Inst.
              </th>
              {projection && (
                <th
                  className="pb-3 text-right text-cyan-400"
                  title={`Instalaciones al cierre al ritmo de ${projection.elapsedDays} de ${projection.monthDays} días laborables`}
                >
                  <Gauge className="mr-1 inline h-3 w-3" />Proyección
                </th>
              )}
              <th className="pb-3 text-right text-blue-400">
                <RefreshCw className="mr-1 inline h-3 w-3" />React.
              </th>
              <th className="pb-3 text-right">Bajas</th>
              <th className="pb-3 text-right">Churn %</th>
              <th className="pb-3 text-right">Crec %</th>
              <th className="pb-3 text-right text-sky-400">Objetivo</th>
              <th className="pb-3 text-right font-bold text-amber-500">Faltante</th>
              <th className="pb-3 text-right">Cumpl. Ingreso</th>
              <th className="pb-3 text-right">Cumpl. Ventas</th>
              <th className="pb-3 text-right">Cumpl. Cierre</th>
              <th className="pb-3 pr-2 text-right">Cierre</th>
              {renderRowAction && <th className="pb-3 pr-2 text-right"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-xs font-bold">
            {pagination.visible.map((node, idx) => {
              const start = Number(node.active_start ?? 0);
              // Los hooks de los reportes resuelven la meta de cada nodo; el
              // respaldo solo cubre un uso que no pase por ellos.
              const goal = node.goal
                ?? baseGoal(start, overallTarget(DEFAULT_TARGETS, ''));
              const metrics = calcCommercial(
                start,
                Number(node.active_end ?? 0),
                goal,
                { new_subs: Number(node.new_subs ?? 0), projection },
              );
              const growth = Number(node.growth ?? 0);
              const churn = Number(node.gross_churn_pct ?? 0);

              return (
                <tr key={idx} className="group transition-colors hover:bg-white/5">
                  <td className="sticky left-0 z-10 bg-surface-secondary py-3 pl-2 pr-3 font-black text-white">
                    <div className="flex items-center gap-2">
                      {renderBadge?.(node)}
                      <span>{node.zona_sucursal}</span>
                    </div>
                  </td>
                  <td className={num('text-slate-400')}>{formatInteger(node.active_start)}</td>
                  <td className={num('text-emerald-400')}>+{formatInteger(node.new_subs)}</td>
                  {projection && (
                    <ProjectionCell
                      installs={metrics.projectedInstalls}
                      compliance={metrics.projectedSalesCompliance}
                      thresholds={thresholds}
                      mono={mono}
                    />
                  )}
                  <td className={num('text-blue-400')}>{formatInteger(node.reactivations)}</td>
                  <td className={num('text-rose-500')}>-{formatInteger(node.churned)}</td>
                  <td
                    className={num(TONE_TEXT[churnTone(churn, thresholds)])}
                    title={`Objetivo de churn: ${formatTwoDecimals(goal.churnPct)}%`}
                  >
                    {formatTwoDecimals(node.gross_churn_pct)}%
                  </td>
                  <td
                    className={num(TONE_TEXT[growthTone(growth, thresholds)])}
                    title={`Objetivo de crecimiento: ${formatTwoDecimals(goal.growthPct)}%`}
                  >
                    {formatTwoDecimals(node.growth)}%
                  </td>
                  <td className="py-2 text-right">
                    <TargetBadge
                      percentage={goal.growthPct}
                      goal={metrics.target}
                      source={node.targetSource}
                      expectedClose={metrics.expectedClose}
                      mono={mono}
                      withoutTarget={metrics.withoutTarget}
                    />
                  </td>
                  <td className={num('font-black text-amber-500/80')}>
                    {metrics.withoutTarget ? <span className="text-slate-600">—</span> : formatInteger(metrics.shortfall)}
                  </td>
                  <ComplianceCell value={metrics.withoutTarget ? null : metrics.complianceRate} thresholds={thresholds} mono={mono} />
                  <ComplianceCell value={metrics.withoutTarget ? null : metrics.salesCompliance} thresholds={thresholds} mono={mono} />
                  <ComplianceCell value={metrics.withoutTarget ? null : metrics.closeCompliance} thresholds={thresholds} mono={mono} />
                  <td className={cn('py-3 pr-2 text-right font-black text-white', mono && 'font-mono')}>
                    {formatInteger(node.active_end)}
                  </td>
                  {renderRowAction && (
                    <td className="py-3 pr-2 text-right">{renderRowAction(node)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination state={pagination} className="mt-2" />
    </div>
  );
}
