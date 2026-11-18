import { proyectar, type Proyeccion } from '@/shared/lib/projection';

import type { TargetsTrafficLight } from '../types';
import { BARRA_TONO, TONE_TEXT, complianceTone, type Meta, type TargetSource } from './targets';

/** The node/zone shape both the Sales and Business Units reports render. */
export interface CommercialNode {
  sucursal?: string;
  /** Solo la zona, sin la sucursal: es la clave con la que se acota el export de bajas. */
  zona?: string;
  zona_sucursal?: string;
  activos_inicio?: number;
  activos_final?: number;
  nuevos?: number;
  reactivaciones?: number;
  bajas?: number;
  crecimiento?: number;
  churn_bruto_pct?: number;
  /**
   * Meta de la fila, resuelta al nivel de zona por el hook del reporte (ver
   * `lib/targets.ts`). Ausente solo si nadie la resolvió todavía.
   */
  meta?: Meta;
  /** Qué nivel fija el objetivo de crecimiento del nodo, para enseñarlo junto a él. */
  targetSource?: TargetSource;
}

export interface CommercialMetrics {
  /** Active base the node is expected to close the month at. */
  expectedClose: number;
  /** Net additions required to hit the target. */
  objetivo: number;
  /** Shortfall against `expectedClose`. */
  faltante: number;
  /**
   * Cumplimiento de ingreso: el crecimiento neto (`final − inicio`) contra
   * `objetivo`, en %. Es el "Cumpl %" histórico de los dos reportes.
   */
  complianceRate: number;
  /** Cumplimiento de ventas: las instalaciones (`nuevos`) contra `objetivo`, en %. */
  salesCompliance: number;
  /** Cumplimiento de cierre: la base final contra `expectedClose`, en %. */
  closeCompliance: number;
  /**
   * Las instalaciones a las que se llegaría al cierre si el resto del mes
   * siguiera el ritmo de los días laborables transcurridos (`shared/lib/projection`).
   * `null` sin un corte del que proyectar.
   */
  instalacionesProyectadas: number | null;
  /** El cumplimiento de ventas con esas instalaciones proyectadas, en %. */
  projectedSalesCompliance: number | null;
  /** Nada que medir: todas sus zonas están sin objetivo. Los cumplimientos se pintan «—». */
  withoutTarget: boolean;
}

export interface CalcCommercialOptions {
  /** Instalaciones del nodo o del grupo, para el cumplimiento de ventas. */
  nuevos?: number;
  /** Los días laborables del corte, para proyectar las instalaciones al cierre. */
  projection?: Proyeccion | null;
}

/**
 * Commercial performance of a node against its growth target.
 *
 * `meta` is the node's or group's `Meta` (`lib/targets.ts`); its
 * `growthGoal` is the absolute net growth required. The zones without
 * objective are already out of a group's `inicio`, `final` and `nuevos` (the
 * hooks sum them with `measuredNodes`); a row that is itself without objective
 * comes back with `withoutTarget`. A bare number is a plain meta.
 *
 * The completions are never clamped: over 100% and below 0 are shown as they
 * are, in both reports (the user's choice; Sales Report used to clamp).
 *
 * Single implementation of what used to be two subtly different copies in
 * `useSalesReportData` and `useBusinessUnitsData`.
 */
export function calcCommercial(
  inicio: number,
  final: number,
  meta: Meta | number,
  { nuevos = 0, projection: proyeccion = null }: CalcCommercialOptions = {},
): CommercialMetrics {
  const { growthGoal: metaCrecimiento, withoutTarget: sinObjetivo = false } = typeof meta === 'number'
    ? { growthGoal: meta, withoutTarget: false }
    : meta;

  const objetivo = metaCrecimiento;
  const cierreEsperado = inicio + objetivo;
  const rawFaltante = cierreEsperado - final;
  const rawRate = objetivo > 0 ? 100 - (rawFaltante / objetivo) * 100 : 0;
  const rawSales = objetivo > 0 ? (nuevos / objetivo) * 100 : 0;
  const rawClose = cierreEsperado > 0 ? (final / cierreEsperado) * 100 : 0;
  const instalacionesProyectadas = proyeccion ? proyectar(nuevos, proyeccion) : null;
  const rawProjectedSales = instalacionesProyectadas !== null && objetivo > 0 && !sinObjetivo
    ? (instalacionesProyectadas / objetivo) * 100
    : null;

  return {
    expectedClose: cierreEsperado,
    objetivo,
    faltante: rawFaltante,
    // Sin recortar a [0, 100], en los dos reportes: a petición del usuario se
    // enseña el valor real, también por encima del 100 % y por debajo de 0.
    complianceRate: rawRate,
    salesCompliance: rawSales,
    closeCompliance: rawClose,
    instalacionesProyectadas,
    projectedSalesCompliance: rawProjectedSales,
    withoutTarget: sinObjetivo,
  };
}

/** Sums a numeric field across nodes, tolerating missing values. */
export function sumField<T extends CommercialNode>(nodes: T[], key: keyof T): number {
  return nodes.reduce((total, node) => total + Number(node[key] ?? 0), 0);
}

/** Aggregate opening/closing figures for a set of nodes. */
export function aggregateNodes<T extends CommercialNode>(nodes: T[]) {
  const activosInicio = sumField(nodes, 'activos_inicio');
  const activosFinal = sumField(nodes, 'activos_final');
  const nuevos = sumField(nodes, 'nuevos');
  const reactivaciones = sumField(nodes, 'reactivaciones');
  const bajas = sumField(nodes, 'bajas');

  return {
    activos_inicio: activosInicio,
    activos_final: activosFinal,
    nuevos,
    reactivaciones,
    bajas,
    crecimiento: activosInicio > 0 ? ((activosFinal - activosInicio) / activosInicio) * 100 : 0,
    churn_rate: activosInicio > 0 ? (bajas / activosInicio) * 100 : 0,
  };
}

/** Tailwind text colour for a completion rate, shared by both reports. */
export function completionTone(tasaCumplimiento: number, semaforo: TargetsTrafficLight): string {
  return TONE_TEXT[complianceTone(tasaCumplimiento, semaforo)];
}

/** Tailwind background for the completion progress bar. */
export function completionBar(tasaCumplimiento: number, semaforo: TargetsTrafficLight): string {
  return BARRA_TONO[complianceTone(tasaCumplimiento, semaforo)];
}
