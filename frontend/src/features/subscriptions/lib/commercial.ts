/** Monthly growth target applied to the opening active base. */
export const GROWTH_TARGET_RATE = 0.06;

/** The node/zone shape both the Sales and Business Units reports render. */
export interface CommercialNode {
  sucursal?: string;
  zona_sucursal?: string;
  activos_inicio?: number;
  activos_final?: number;
  nuevos?: number;
  reactivaciones?: number;
  bajas?: number;
  crecimiento?: number;
  churn_bruto_pct?: number;
}

export interface CommercialMetrics {
  /** Active base the node is expected to close the month at. */
  cierreEsperado: number;
  /** Net additions required to hit the target. */
  objetivo: number;
  /** Shortfall against `cierreEsperado`. */
  faltante: number;
  /** Progress toward `objetivo`, as a percentage. */
  tasaCumplimiento: number;
}

export interface CalcCommercialOptions {
  /**
   * Clamp `faltante` at 0 and `tasaCumplimiento` to [0, 100].
   *
   * The two reports disagree here and always have: Sales Report clamps, so an
   * over-performing node reads as exactly 100%; Business Units does not, so it
   * can report >100% and drive its "Meta Cumplida" badge. Both behaviours are
   * preserved deliberately — do not change one without the other.
   */
  clamp?: boolean;
}

/**
 * Commercial performance of a node against its 6% growth target.
 *
 * Single implementation of what used to be two subtly different copies in
 * `useSalesReportData` and `useBusinessUnitsData`.
 */
export function calcComercial(
  inicio: number,
  final: number,
  { clamp = false }: CalcCommercialOptions = {},
): CommercialMetrics {
  const cierreEsperado = inicio * (1 + GROWTH_TARGET_RATE);
  const objetivo = inicio * GROWTH_TARGET_RATE;
  const rawFaltante = cierreEsperado - final;
  const rawTasa = objetivo > 0 ? 100 - (rawFaltante / objetivo) * 100 : 0;

  return {
    cierreEsperado,
    objetivo,
    faltante: clamp ? Math.max(rawFaltante, 0) : rawFaltante,
    tasaCumplimiento: clamp ? Math.min(100, Math.max(0, rawTasa)) : rawTasa,
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
export function completionTone(tasaCumplimiento: number): string {
  if (tasaCumplimiento >= 100) return 'text-emerald-400';
  if (tasaCumplimiento >= 60) return 'text-amber-400';
  return 'text-rose-400';
}

/** Tailwind background for the completion progress bar. */
export function completionBar(tasaCumplimiento: number): string {
  if (tasaCumplimiento >= 100) return 'bg-emerald-400';
  if (tasaCumplimiento >= 60) return 'bg-amber-400';
  return 'bg-rose-400';
}
