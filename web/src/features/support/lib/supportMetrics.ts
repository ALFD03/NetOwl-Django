/**
 * Lectura de los bloques de métricas de soporte y etiquetas de cada medida.
 *
 * Las tres medidas de tiempo miden cosas distintas —el ciclo completo, solo la
 * gestión del técnico y la espera hasta la asignación— y es lo que distinguen
 * `CIERRE_TOTAL`, `GESTION` y `ASIGNACION`.
 */

import type { MetricColor } from '@/shared/ui';
import { toNumber } from '@/shared/utils';
import {
  SUPPORT_TIME_MEASURES,
  type SupportDimensionEntry,
  type SupportDimensionRow,
  type SupportHistoricoRow,
  type SupportMetrics,
  type SupportStats,
  type SupportTimeDistribution,
  type SupportTimeMeasure,
  type SupportTimeStats,
} from '../types';

/** The nine scalar keys the backend stores for one measure. */
function timeStatKeys(medida: SupportTimeMeasure): Array<keyof SupportTimeStats> {
  return [
    `tiempo_medio_${medida}_horas`,
    `tiempo_mediana_${medida}_horas`,
    `tiempo_min_${medida}_horas`,
    `tiempo_p25_${medida}_horas`,
    `tiempo_p75_${medida}_horas`,
    `tiempo_max_${medida}_horas`,
    `tiempo_std_${medida}_horas`,
    `pct_excede_promedio_${medida}`,
    `muestra_${medida}`,
  ];
}

const TIME_STAT_KEYS: Array<keyof SupportTimeStats> = SUPPORT_TIME_MEASURES.flatMap(timeStatKeys);

const RATE_KEYS = [
  'total_tickets', 'tickets_creados', 'tickets_cerrados',
  'tickets_resueltos', 'tickets_resueltos_periodo', 'tickets_resueltos_arrastre',
  'tickets_cancelados', 'tickets_cancelados_periodo', 'tickets_cancelados_arrastre',
  'tickets_rezagados',
  'pct_resueltos', 'pct_resueltos_periodo', 'pct_resueltos_arrastre',
  'pct_cancelados', 'pct_cancelados_periodo', 'pct_cancelados_arrastre',
  'pct_rezagados',
] as const satisfies ReadonlyArray<keyof SupportStats>;

const ALL_KEYS: Array<keyof SupportStats> = [...TIME_STAT_KEYS, ...RATE_KEYS];

/** Sixty-three time columns plus seventeen volume and rate ones. */
export function emptyStats(): SupportStats {
  return Object.fromEntries(ALL_KEYS.map((key) => [key, 0])) as SupportStats;
}

/** One metric block with every optional resolved to a number. */
export function resolveStats(metrics: SupportMetrics | undefined): SupportStats {
  const source = (metrics ?? {}) as Record<string, number | undefined>;
  return Object.fromEntries(ALL_KEYS.map((key) => [key, toNumber(source[key])])) as SupportStats;
}

/** Reads one `_compute_stats_for_series` block out of its flat column names. */
export function distribution(
  metrics: SupportMetrics | undefined,
  medida: SupportTimeMeasure,
): SupportTimeDistribution {
  const source = (metrics ?? {}) as Record<string, number | undefined>;
  const num = (key: string) => toNumber(source[key]);

  return {
    promedio: num(`tiempo_medio_${medida}_horas`),
    mediana: num(`tiempo_mediana_${medida}_horas`),
    min: num(`tiempo_min_${medida}_horas`),
    p25: num(`tiempo_p25_${medida}_horas`),
    p75: num(`tiempo_p75_${medida}_horas`),
    max: num(`tiempo_max_${medida}_horas`),
    std: num(`tiempo_std_${medida}_horas`),
    pctExcedeProm: num(`pct_excede_promedio_${medida}`),
    muestra: num(`muestra_${medida}`),
  };
}

/** Mean of one column across period rows, used by the company-wide dashboard. */
export function averageField(
  rows: SupportHistoricoRow[],
  key: keyof SupportHistoricoRow,
  digits = 2,
): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, row) => acc + toNumber(row[key] as number | undefined), 0);
  return Number((sum / rows.length).toFixed(digits));
}

export function share(part: number, whole: number): number {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0;
}

/**
 * Hoists `metricas` to the top level and states each value's weight against its
 * parent, so tables and charts read a single flat level.
 */
export function flattenEntries(
  entries: SupportDimensionEntry[] | undefined,
  parentTotal: number,
): SupportDimensionRow[] {
  return (entries ?? [])
    .map((entry) => ({
      ...(entry.metricas ?? {}),
      nombre: entry.nombre,
      pctDelPadre: share(toNumber(entry.metricas?.total_tickets), parentTotal),
    }))
    .sort((a, b) => toNumber(b.total_tickets) - toNumber(a.total_tickets));
}

// --- Vocabulario ------------------------------------------------------------

export interface TimeMeasureMeta {
  label: string;
  caption: string;
  color: Extract<MetricColor, 'blue' | 'purple' | 'slate' | 'red' | 'green'>;
}

/**
 * The seven measures with their reading. The colour encodes the formula, not
 * the outcome: blue is the whole process, purple the technician's handling and
 * slate the queue — so the three families stay distinguishable at a glance
 * without needing seven different tokens.
 *
 * The caption names the population as well as the formula, because the two
 * clocks are measured on what closed in the period and the queue on what was
 * raised in it. Spelling it out on every card is what lets the population stay
 * fixed per measure instead of being a control the reader has to operate.
 */
export const TIME_MEASURE_META: Record<SupportTimeMeasure, TimeMeasureMeta> = {
  cierre_creado_resuelto: { label: 'Cierre total · Resueltos', caption: 'Creación → cierre · cerrados en el mes', color: 'green' },
  cierre_creado_cancelado: { label: 'Cierre total · Cancelados', caption: 'Creación → cierre · cerrados en el mes', color: 'red' },
  cierre_creado_cerrados: { label: 'Cierre total · Todos', caption: 'Creación → cierre · cerrados en el mes', color: 'blue' },

  cierre_asignado_resuelto: { label: 'Gestión · Resueltos', caption: 'Asignación → cierre · cerrados en el mes', color: 'green' },
  cierre_asignado_cancelado: { label: 'Gestión · Cancelados', caption: 'Asignación → cierre · cerrados en el mes', color: 'red' },
  cierre_asignado_cerrados: { label: 'Gestión · Todos', caption: 'Asignación → cierre · cerrados en el mes', color: 'purple' },

  asignacion: { label: 'Tiempo de Asignación', caption: 'Creación → asignación · creados en el mes', color: 'slate' },
};

/** The two clocks the summary panels lead with, one per formula. */
export const CIERRE_TOTAL: SupportTimeMeasure = 'cierre_creado_cerrados';
export const GESTION: SupportTimeMeasure = 'cierre_asignado_cerrados';
export const ASIGNACION: SupportTimeMeasure = 'asignacion';

export const SUPPORT_DIMENSION_LABELS = {
  zona: 'Zona',
  sucursal: 'Sucursal',
  asignado_a: 'Asignado a',
} as const;

export const SUPPORT_DESGLOSE_LABELS = {
  tipo_solicitud: 'Tipo de ticket',
  razon_falla: 'Razón de la falla',
  solucion_falla: 'Solución aplicada',
} as const;
