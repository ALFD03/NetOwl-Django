/** La tabla de nodos de los dos reportes comerciales, con su KPI de cumplimiento. */

import type { ReactNode } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import {
  calcComercial,
  completionBar,
  completionTone,
  type CommercialNode,
} from '../../lib/commercial';

export interface NodePerformanceTableProps<T extends CommercialNode> {
  nodes: T[];
  /** Header for the first column — the reports label their rows differently. */
  labelHeader: string;
  /** Optional chip before the row label, e.g. the FTTH/RF technology badge. */
  renderBadge?: (node: T) => ReactNode;
  /** Tabular figures on every numeric cell. */
  mono?: boolean;
  /** Clamp completion to [0, 100]. See `calcComercial`. */
  clampCompletion?: boolean;
  /**
   * Acción al final de cada fila, p. ej. exportar las bajas de esa zona.
   *
   * La columna solo aparece cuando se pasa: la tabla la comparten los dos
   * reportes y no todos sus usos tienen algo que poner ahí.
   */
  renderRowAction?: (node: T) => ReactNode;
}


/**
 * Per-node commercial performance table.
 *
 * `SalesReport` and `BusinessUnits` each carried a verbatim copy of this
 * ten-column table; they now differ only by `labelHeader`, `renderBadge`,
 * `mono` and the clamping rule.
 */
export function NodePerformanceTable<T extends CommercialNode>({
  nodes,
  labelHeader,
  renderBadge,
  mono = false,
  clampCompletion = false,
  renderRowAction,
}: NodePerformanceTableProps<T>) {
  const num = (extra?: string) => cn('py-3 text-right', mono && 'font-mono', extra);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            <th className="pb-3 pl-2">{labelHeader}</th>
            <th className="pb-3 text-right">Inicio</th>
            <th className="pb-3 text-right text-emerald-500">
              <TrendingUp className="mr-1 inline h-3 w-3" />Inst.
            </th>
            <th className="pb-3 text-right text-blue-400">
              <RefreshCw className="mr-1 inline h-3 w-3" />React.
            </th>
            <th className="pb-3 text-right">Bajas</th>
            <th className="pb-3 text-right">Churn %</th>
            <th className="pb-3 text-right">Crec %</th>
            <th className="pb-3 text-right font-bold text-amber-500">Faltante</th>
            <th className="pb-3 text-right">Cumpl %</th>
            <th className="pb-3 pr-2 text-right">Cierre</th>
            {renderRowAction && <th className="pb-3 pr-2 text-right"><span className="sr-only">Acciones</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50 text-xs font-bold">
          {nodes.map((node, idx) => {
            const metrics = calcComercial(
              Number(node.activos_inicio ?? 0),
              Number(node.activos_final ?? 0),
              { clamp: clampCompletion },
            );
            const growth = Number(node.crecimiento ?? 0);

            return (
              <tr key={idx} className="group transition-colors hover:bg-white/5">
                <td className="flex items-center gap-2 py-3 pl-2 font-black text-white">
                  {renderBadge?.(node)}
                  <span>{node.zona_sucursal}</span>
                </td>
                <td className={num('text-slate-400')}>{formatInteger(node.activos_inicio)}</td>
                <td className={num('text-emerald-400')}>+{formatInteger(node.nuevos)}</td>
                <td className={num('text-blue-400')}>{formatInteger(node.reactivaciones)}</td>
                <td className={num('text-rose-500')}>-{formatInteger(node.bajas)}</td>
                <td className={num('text-rose-500')}>{formatTwoDecimals(node.churn_bruto_pct)}%</td>
                <td className={num(growth >= 4 ? 'text-emerald-400' : growth >= 0 ? 'text-amber-400' : 'text-rose-400')}>
                  {formatTwoDecimals(node.crecimiento)}%
                </td>
                <td className={num('font-black text-amber-500/80')}>{formatInteger(metrics.faltante)}</td>
                <td className="py-3 text-right">
                  <div className="flex flex-col items-end">
                    <span className={cn('font-black', mono && 'font-mono', completionTone(metrics.tasaCumplimiento))}>
                      {formatTwoDecimals(metrics.tasaCumplimiento)}%
                    </span>
                    <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={cn('h-full', completionBar(metrics.tasaCumplimiento))}
                        style={{ width: `${Math.min(Math.max(metrics.tasaCumplimiento, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className={cn('py-3 pr-2 text-right font-black text-white', mono && 'font-mono')}>
                  {formatInteger(node.activos_final)}
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
  );
}
