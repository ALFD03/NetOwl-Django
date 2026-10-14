/** La tabla de nodos de los dos reportes comerciales, con su objetivo y sus tres cumplimientos. */

import type { ReactNode } from 'react';
import { Gauge, RefreshCw, TrendingUp } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import type { Proyeccion } from '@/shared/lib/proyeccion';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useObjetivosConfig } from '../../hooks/useObjetivos';
import {
  calcComercial,
  completionBar,
  completionTone,
  type CommercialNode,
} from '../../lib/commercial';
import {
  OBJETIVOS_POR_DEFECTO,
  TEXTO_TONO,
  formatObjetivo,
  metaDeBase,
  objetivoGeneral,
  tonoChurn,
  tonoCrecimiento,
} from '../../lib/objetivos';
import type { SemaforoObjetivos } from '../../types';
import { NIVEL_OBJETIVO_UI } from '../objetivos/niveles';

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
  /**
   * Los días laborables del corte elegido. Con ellos aparece la columna de
   * proyección: las instalaciones al ritmo actual hasta el cierre del mes.
   */
  proyeccion?: Proyeccion | null;
}

/**
 * El objetivo de un nodo, a la vista: el porcentaje grande, la meta en altas
 * netas y de qué nivel sale (el nodo, su zona, su sucursal, su coordinador...).
 * Solo se enseña: los objetivos se editan en el catálogo.
 */
function InsigniaObjetivo({
  porcentaje,
  meta,
  origen,
  cierreEsperado,
  mono,
}: {
  porcentaje: number;
  meta: number;
  origen?: CommercialNode['origenObjetivo'];
  cierreEsperado: number;
  mono: boolean;
}) {
  const ui = NIVEL_OBJETIVO_UI[origen?.nivel ?? 'general'];
  const contenido = (
    <>
      <span className="flex items-baseline gap-1.5">
        <span className={cn('text-sm font-black text-sky-300', mono && 'font-mono')}>{formatObjetivo(porcentaje)}</span>
        <span className={cn('text-[10px] font-bold text-slate-400', mono && 'font-mono')}>+{formatInteger(meta)}</span>
      </span>
      <span className={cn('mt-0.5 max-w-[140px] truncate rounded border px-1.5 py-px text-[9px] font-black uppercase', ui.chip)}>
        {ui.corto}{origen?.nombre && origen.nivel !== 'zona_sucursal' ? ` ${origen.nombre}` : ''}
      </span>
    </>
  );
  const titulo = `Objetivo ${formatObjetivo(porcentaje)} (${ui.label.toLowerCase()}${origen?.nombre ? ` ${origen.nombre}` : ''}) · cierre esperado ${formatInteger(cierreEsperado)}`;

  return <div className="flex flex-col items-end" title={titulo}>{contenido}</div>;
}

/** Un cumplimiento: el porcentaje con el color del semáforo y una barra de progreso. */
function CeldaCumplimiento({
  valor,
  semaforo,
  mono,
}: {
  valor: number;
  semaforo: SemaforoObjetivos;
  mono: boolean;
}) {
  return (
    <td className="py-3 text-right">
      <div className="flex flex-col items-end">
        <span className={cn('font-black', mono && 'font-mono', completionTone(valor, semaforo))}>
          {formatTwoDecimals(valor)}%
        </span>
        <div className="mt-1 h-1 w-12 overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn('h-full', completionBar(valor, semaforo))}
            style={{ width: `${Math.min(Math.max(valor, 0), 100)}%` }}
          />
        </div>
      </div>
    </td>
  );
}

/** Las instalaciones proyectadas al cierre y el cumplimiento de ventas que darían. */
function CeldaProyeccion({
  instalaciones,
  cumplimiento,
  semaforo,
  mono,
}: {
  instalaciones: number | null;
  cumplimiento: number | null;
  semaforo: SemaforoObjetivos;
  mono: boolean;
}) {
  if (instalaciones === null) return <td className="py-3 text-right text-slate-600">—</td>;

  return (
    <td className="py-3 text-right">
      <div className="flex flex-col items-end">
        <span className={cn('font-black text-cyan-300', mono && 'font-mono')}>{formatInteger(instalaciones)}</span>
        {cumplimiento !== null && (
          <span
            className={cn('text-[10px] font-bold', mono && 'font-mono', completionTone(cumplimiento, semaforo))}
            title="Cumplimiento de ventas proyectado al cierre"
          >
            {formatTwoDecimals(cumplimiento)}% obj.
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
 * table; they now differ only by `labelHeader`, `renderBadge`, `mono` and the
 * clamping rule.
 *
 * Cada fila enseña su objetivo —la meta absoluta y el porcentaje que la
 * produce, que puede ser propio de la zona— y los tres cumplimientos contra
 * ella: ingreso (crecimiento neto), ventas (instalaciones) y cierre (base
 * final contra la esperada). Con un día de corte elegido, además, la
 * proyección de las instalaciones al cierre (ver `shared/lib/proyeccion`).
 */
export function NodePerformanceTable<T extends CommercialNode>({
  nodes,
  labelHeader,
  renderBadge,
  mono = false,
  clampCompletion = false,
  renderRowAction,
  proyeccion = null,
}: NodePerformanceTableProps<T>) {
  const { semaforo } = useObjetivosConfig();
  const num = (extra?: string) => cn('py-3 text-right', mono && 'font-mono', extra);

  return (
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
            {proyeccion && (
              <th
                className="pb-3 text-right text-cyan-400"
                title={`Instalaciones al cierre al ritmo de ${proyeccion.diasTranscurridos} de ${proyeccion.diasMes} días laborables`}
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
          {nodes.map((node, idx) => {
            const inicio = Number(node.activos_inicio ?? 0);
            // Los hooks de los reportes resuelven la meta de cada nodo; el
            // respaldo solo cubre un uso que no pase por ellos.
            const meta = node.meta
              ?? metaDeBase(inicio, objetivoGeneral(OBJETIVOS_POR_DEFECTO, ''));
            const metrics = calcComercial(
              inicio,
              Number(node.activos_final ?? 0),
              meta.metaCrecimiento,
              { clamp: clampCompletion, nuevos: Number(node.nuevos ?? 0), proyeccion },
            );
            const growth = Number(node.crecimiento ?? 0);
            const churn = Number(node.churn_bruto_pct ?? 0);

            return (
              <tr key={idx} className="group transition-colors hover:bg-white/5">
                <td className="sticky left-0 z-10 bg-surface-secondary py-3 pl-2 pr-3 font-black text-white">
                  <div className="flex items-center gap-2">
                    {renderBadge?.(node)}
                    <span>{node.zona_sucursal}</span>
                  </div>
                </td>
                <td className={num('text-slate-400')}>{formatInteger(node.activos_inicio)}</td>
                <td className={num('text-emerald-400')}>+{formatInteger(node.nuevos)}</td>
                {proyeccion && (
                  <CeldaProyeccion
                    instalaciones={metrics.instalacionesProyectadas}
                    cumplimiento={metrics.cumplimientoVentasProyectado}
                    semaforo={semaforo}
                    mono={mono}
                  />
                )}
                <td className={num('text-blue-400')}>{formatInteger(node.reactivaciones)}</td>
                <td className={num('text-rose-500')}>-{formatInteger(node.bajas)}</td>
                <td
                  className={num(TEXTO_TONO[tonoChurn(churn, semaforo)])}
                  title={`Objetivo de churn: ${formatTwoDecimals(meta.churnPct)}%`}
                >
                  {formatTwoDecimals(node.churn_bruto_pct)}%
                </td>
                <td
                  className={num(TEXTO_TONO[tonoCrecimiento(growth, semaforo)])}
                  title={`Objetivo de crecimiento: ${formatTwoDecimals(meta.crecimientoPct)}%`}
                >
                  {formatTwoDecimals(node.crecimiento)}%
                </td>
                <td className="py-2 text-right">
                  <InsigniaObjetivo
                    porcentaje={meta.crecimientoPct}
                    meta={metrics.objetivo}
                    origen={node.origenObjetivo}
                    cierreEsperado={metrics.cierreEsperado}
                    mono={mono}
                  />
                </td>
                <td className={num('font-black text-amber-500/80')}>{formatInteger(metrics.faltante)}</td>
                <CeldaCumplimiento valor={metrics.tasaCumplimiento} semaforo={semaforo} mono={mono} />
                <CeldaCumplimiento valor={metrics.cumplimientoVentas} semaforo={semaforo} mono={mono} />
                <CeldaCumplimiento valor={metrics.cumplimientoCierre} semaforo={semaforo} mono={mono} />
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
