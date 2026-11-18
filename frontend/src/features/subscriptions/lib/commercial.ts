import { project, type Projection } from '@/shared/lib/projection';

import type { TargetsTrafficLight } from '../types';
import { TONE_BAR, TONE_TEXT, complianceTone, type Goal, type TargetSource } from './targets';

/** The node/zone shape both the Sales and Business Units reports render. */
export interface CommercialNode {
  sucursal?: string;
  /** Solo la zona, sin la sucursal: es la clave con la que se acota el export de bajas. */
  zona?: string;
  zona_sucursal?: string;
  active_start?: number;
  active_end?: number;
  new_subs?: number;
  reactivations?: number;
  churned?: number;
  growth?: number;
  gross_churn_pct?: number;
  /**
   * Meta de la fila, resuelta al nivel de zona por el hook del reporte (ver
   * `lib/targets.ts`). Ausente solo si nadie la resolvió todavía.
   */
  goal?: Goal;
  /** Qué nivel fija el objetivo de crecimiento del nodo, para enseñarlo junto a él. */
  targetSource?: TargetSource;
}

export interface CommercialMetrics {
  /** Active base the node is expected to close the month at. */
  expectedClose: number;
  /** Net additions required to hit the target. */
  target: number;
  /** Shortfall against `expectedClose`. */
  shortfall: number;
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
  projectedInstalls: number | null;
  /** El cumplimiento de ventas con esas instalaciones proyectadas, en %. */
  projectedSalesCompliance: number | null;
  /** Nada que medir: todas sus zonas están sin objetivo. Los cumplimientos se pintan «—». */
  withoutTarget: boolean;
}

export interface CalcCommercialOptions {
  /** Instalaciones del nodo o del grupo, para el cumplimiento de ventas. */
  new_subs?: number;
  /** Los días laborables del corte, para proyectar las instalaciones al cierre. */
  projection?: Projection | null;
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
  start: number,
  final: number,
  goal: Goal | number,
  { new_subs: newSubs = 0, projection: projection = null }: CalcCommercialOptions = {},
): CommercialMetrics {
  const { growthGoal, withoutTarget: withoutTarget = false } = typeof goal === 'number'
    ? { growthGoal: goal, withoutTarget: false }
    : goal;

  const target = growthGoal;
  const expectedClose = start + target;
  const rawShortfall = expectedClose - final;
  const rawRate = target > 0 ? 100 - (rawShortfall / target) * 100 : 0;
  const rawSales = target > 0 ? (newSubs / target) * 100 : 0;
  const rawClose = expectedClose > 0 ? (final / expectedClose) * 100 : 0;
  const projectedInstalls = projection ? project(newSubs, projection) : null;
  const rawProjectedSales = projectedInstalls !== null && target > 0 && !withoutTarget
    ? (projectedInstalls / target) * 100
    : null;

  return {
    expectedClose,
    target,
    shortfall: rawShortfall,
    // Sin recortar a [0, 100], en los dos reportes: a petición del usuario se
    // enseña el valor real, también por encima del 100 % y por debajo de 0.
    complianceRate: rawRate,
    salesCompliance: rawSales,
    closeCompliance: rawClose,
    projectedInstalls,
    projectedSalesCompliance: rawProjectedSales,
    withoutTarget,
  };
}

/** Sums a numeric field across nodes, tolerating missing values. */
export function sumField<T extends CommercialNode>(nodes: T[], key: keyof T): number {
  return nodes.reduce((total, node) => total + Number(node[key] ?? 0), 0);
}

/** Aggregate opening/closing figures for a set of nodes. */
export function aggregateNodes<T extends CommercialNode>(nodes: T[]) {
  const startActive = sumField(nodes, 'active_start');
  const endActive = sumField(nodes, 'active_end');
  const newSubs = sumField(nodes, 'new_subs');
  const reactivations = sumField(nodes, 'reactivations');
  const churns = sumField(nodes, 'churned');

  return {
    active_start: startActive,
    active_end: endActive,
    new_subs: newSubs,
    reactivations,
    churned: churns,
    growth: startActive > 0 ? ((endActive - startActive) / startActive) * 100 : 0,
    churn_rate: startActive > 0 ? (churns / startActive) * 100 : 0,
  };
}

/** Tailwind text colour for a completion rate, shared by both reports. */
export function completionTone(complianceRate: number, trafficLight: TargetsTrafficLight): string {
  return TONE_TEXT[complianceTone(complianceRate, trafficLight)];
}

/** Tailwind background for the completion progress bar. */
export function completionBar(complianceRate: number, trafficLight: TargetsTrafficLight): string {
  return TONE_BAR[complianceTone(complianceRate, trafficLight)];
}
