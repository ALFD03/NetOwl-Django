/**
 * Lectura de los bloques de métricas de soporte y etiquetas de cada medida.
 *
 * Las tres medidas de tiempo miden cosas distintas —el ciclo completo, solo la
 * gestión del técnico y la espera hasta la asignación— y es lo que distinguen
 * `CLOSE_TOTAL`, `HANDLING` y `ASIGNACION`.
 */

import type { MetricColor } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals, toNumber } from '@/shared/utils';
import {
  SUPPORT_TIME_MEASURES,
  type SupportDepartmentRow,
  type SupportDimension,
  type SupportDimensionEntry,
  type SupportDimensionRow,
  type SupportHistoryRow,
  type SupportMetrics,
  type SupportStats,
  type SupportTimeDistribution,
  type SupportTimeMeasure,
  type SupportTimeStats,
} from '../types';

/** The nine scalar keys the backend stores for one measure. */
function timeStatKeys(measure: SupportTimeMeasure): Array<keyof SupportTimeStats> {
  return [
    `time_mean_${measure}_hours`,
    `time_median_${measure}_hours`,
    `time_min_${measure}_hours`,
    `time_p25_${measure}_hours`,
    `time_p75_${measure}_hours`,
    `time_max_${measure}_hours`,
    `time_std_${measure}_hours`,
    `pct_over_avg_${measure}`,
    `sample_${measure}`,
  ];
}

const TIME_STAT_KEYS: Array<keyof SupportTimeStats> = SUPPORT_TIME_MEASURES.flatMap(timeStatKeys);

const RATE_KEYS = [
  'total_tickets', 'tickets_created', 'tickets_closed',
  'tickets_resolved', 'tickets_resolved_in_period', 'tickets_resolved_carryover',
  'tickets_cancelled', 'tickets_cancelled_in_period', 'tickets_cancelled_carryover',
  'tickets_escalated', 'tickets_escalated_in_period', 'tickets_escalated_carryover',
  'tickets_received_escalated',
  'tickets_lagging',
  'pct_resolved', 'pct_resolved_in_period', 'pct_resolved_carryover',
  'pct_cancelled', 'pct_cancelled_in_period', 'pct_cancelled_carryover',
  'pct_escalated', 'pct_escalated_in_period', 'pct_escalated_carryover',
  'pct_received_escalated',
  'pct_lagging',
  'queue_hours', 'pause_hours',
  'handling_hours', 'unclassified_hours', 'composition_sample',
] as const satisfies ReadonlyArray<keyof SupportStats>;

const ALL_KEYS: Array<keyof SupportStats> = [...TIME_STAT_KEYS, ...RATE_KEYS];

/** Seventy-two time columns plus the volume, rate and composition ones. */
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
  measure: SupportTimeMeasure,
): SupportTimeDistribution {
  const source = (metrics ?? {}) as Record<string, number | undefined>;
  const num = (key: string) => toNumber(source[key]);

  return {
    average: num(`time_mean_${measure}_hours`),
    median: num(`time_median_${measure}_hours`),
    min: num(`time_min_${measure}_hours`),
    p25: num(`time_p25_${measure}_hours`),
    p75: num(`time_p75_${measure}_hours`),
    max: num(`time_max_${measure}_hours`),
    std: num(`time_std_${measure}_hours`),
    pctAboveAvg: num(`pct_over_avg_${measure}`),
    sample: num(`sample_${measure}`),
  };
}

/** Mean of one column across period rows, used by the company-wide dashboard. */
export function averageField(
  rows: SupportHistoryRow[],
  key: keyof SupportHistoryRow,
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
      ...(entry.metrics ?? {}),
      name: entry.name,
      pctOfParent: share(toNumber(entry.metrics?.total_tickets), parentTotal),
      department: entry.department ?? '',
    }))
    .sort((a, b) => toNumber(b.total_tickets) - toNumber(a.total_tickets));
}

// --- Agrupación por departamento --------------------------------------------

/** Cómo se llama en la tabla quien no está en el directorio de `/support/users/`. */
export const NO_DEPARTMENT = 'Sin departamento';

/** Los volúmenes: se suman sin más, porque las personas parten los tickets. */
const VOLUME_KEYS = [
  'total_tickets', 'tickets_created', 'tickets_closed',
  'tickets_resolved', 'tickets_resolved_in_period', 'tickets_resolved_carryover',
  'tickets_cancelled', 'tickets_cancelled_in_period', 'tickets_cancelled_carryover',
  'tickets_escalated', 'tickets_escalated_in_period', 'tickets_escalated_carryover',
  'tickets_received_escalated',
  'tickets_lagging',
] as const satisfies ReadonlyArray<keyof SupportStats>;

/**
 * Suma las filas de un eje de persona por el departamento de cada una.
 *
 * Los tres porqués de cada familia de cifras están en `SupportDepartmentRow`.
 * `parentTotal` es el mismo denominador que usa la tabla de personas —el total
 * del grupo—, de modo que los dos `% del Total` se leen contra lo mismo.
 */
export function groupByDepartment(
  rows: SupportDimensionRow[],
  parentTotal: number,
): SupportDepartmentRow[] {
  const accumulated = new Map<string, { row: SupportDepartmentRow; weights: Map<string, number> }>();

  for (const row of rows) {
    const name = row.department || NO_DEPARTMENT;
    let entry = accumulated.get(name);
    if (entry === undefined) {
      entry = {
        row: { ...emptyStats(), name, pctOfParent: 0, department: name, people: 0 },
        weights: new Map(),
      };
      accumulated.set(name, entry);
    }

    entry.row.people += 1;
    for (const key of VOLUME_KEYS) {
      entry.row[key] = toNumber(entry.row[key]) + toNumber(row[key]);
    }

    // Media ponderada de los tiempos: se acumula suma(media × muestra) y la
    // muestra, y se divide al final. La media de las medias sin ponderar daría
    // el mismo peso a quien cerró tres tickets que a quien cerró trescientos.
    for (const measure of SUPPORT_TIME_MEASURES) {
      const sample = toNumber(row[`sample_${measure}`]);
      if (sample <= 0) continue;
      const key = `time_mean_${measure}_hours` as const;
      entry.row[key] = toNumber(entry.row[key]) + toNumber(row[key]) * sample;
      entry.weights.set(measure, (entry.weights.get(measure) ?? 0) + sample);
    }
  }

  return [...accumulated.values()]
    .map(({ row, weights }) => {
      for (const measure of SUPPORT_TIME_MEASURES) {
        const sample = weights.get(measure) ?? 0;
        const key = `time_mean_${measure}_hours` as const;
        row[`sample_${measure}`] = sample;
        row[key] = sample > 0 ? Number((toNumber(row[key]) / sample).toFixed(2)) : 0;
      }

      // Las tasas se recalculan desde las sumas, nunca se promedian: cada una
      // trae fijado su denominador —lo cerrado en el mes, o lo creado— y
      // promediar porcentajes de personas con cargas distintas no da ninguno.
      const closedItems = toNumber(row.tickets_closed);
      const created = toNumber(row.tickets_created);
      row.pct_resolved = share(toNumber(row.tickets_resolved), closedItems);
      row.pct_resolved_in_period = share(toNumber(row.tickets_resolved_in_period), closedItems);
      row.pct_resolved_carryover = share(toNumber(row.tickets_resolved_carryover), closedItems);
      row.pct_cancelled = share(toNumber(row.tickets_cancelled), closedItems);
      row.pct_cancelled_in_period = share(toNumber(row.tickets_cancelled_in_period), closedItems);
      row.pct_cancelled_carryover = share(toNumber(row.tickets_cancelled_carryover), closedItems);
      row.pct_escalated = share(toNumber(row.tickets_escalated), closedItems);
      row.pct_escalated_in_period = share(toNumber(row.tickets_escalated_in_period), closedItems);
      row.pct_escalated_carryover = share(toNumber(row.tickets_escalated_carryover), closedItems);
      row.pct_received_escalated = share(toNumber(row.tickets_received_escalated), created);
      row.pct_lagging = share(toNumber(row.tickets_lagging), created);

      row.pctOfParent = share(toNumber(row.total_tickets), parentTotal);
      return row;
    })
    .sort((a, b) => toNumber(b.total_tickets) - toNumber(a.total_tickets));
}

// --- Líderes de una dimensión -----------------------------------------------

/** Una tarjeta de líder: qué se premia, quién lo gana y sobre cuánto. */
export interface SupportLeaderCard {
  id: string;
  /** El criterio, no el valor: es lo que va en el encabezado de la tarjeta. */
  label: string;
  /** El valor de la dimensión que encabeza ese criterio. */
  name: string;
  value: string;
  /** El denominador con el que se calculó la cifra. */
  caption: string;
  color: MetricColor;
}

interface LeaderSpec {
  id: string;
  label: string;
  color: MetricColor;
  pick: (row: SupportDimensionRow) => number | undefined;
  format: (value: number) => string;
  caption: (row: SupportDimensionRow) => string;
}

/**
 * Los cinco criterios que encabeza una tarjeta, uno por pregunta: quién
 * concentra el volumen, quién resuelve más, quién cancela más, quién arrastra
 * más y quién tarda más en cerrar.
 *
 * Cada tarjeta lleva su denominador en el pie porque **el máximo de una tasa
 * es engañoso por sí solo**: un valor con tres tickets cerrados y los tres
 * resueltos marca un 100 % y gana la tarjeta a quien resolvió 400 de 450. La
 * cifra es la que se pidió; el pie es lo que deja juzgarla sin abrir la tabla.
 */
const LEADER_SPECS: LeaderSpec[] = [
  {
    id: 'volumen',
    label: '% del total más alto',
    color: 'blue',
    pick: (r) => r.pctOfParent,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `${formatInteger(toNumber(r.total_tickets))} tickets`,
  },
  {
    id: 'resueltos',
    label: 'Tasa de resueltos más alta',
    color: 'green',
    pick: (r) => r.pct_resolved,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `sobre ${formatInteger(toNumber(r.tickets_closed))} cerrados`,
  },
  {
    id: 'cancelados',
    label: 'Tasa de cancelados más alta',
    color: 'red',
    pick: (r) => r.pct_cancelled,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `sobre ${formatInteger(toNumber(r.tickets_closed))} cerrados`,
  },
  {
    id: 'rezagados',
    label: 'Tasa de rezago más alta',
    color: 'yellow',
    pick: (r) => r.pct_lagging,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `sobre ${formatInteger(toNumber(r.tickets_created))} creados`,
  },
  {
    id: 'cierre',
    label: 'Tiempo de cierre más alto',
    color: 'purple',
    pick: (r) => r.time_mean_close_created_closed_hours,
    format: (v) => `${formatOneDecimal(v)} h`,
    caption: (r) => `muestra ${formatInteger(toNumber(r.sample_close_created_closed))}`,
  },
];

/**
 * Quién encabeza cada uno de los cinco criterios dentro de la dimensión.
 *
 * `rows` llega ordenada por volumen (`flattenEntries`), así que un empate en la
 * cifra lo gana el valor con más tickets, que es el que interesa mirar.
 *
 * Un criterio cuyo máximo es cero no produce tarjeta: nadie canceló nada, o el
 * mes no tiene ningún cierre medible, y una tarjeta a 0 se leería como un dato
 * en vez de como la ausencia de él.
 */
export function dimensionLeaders(rows: SupportDimensionRow[]): SupportLeaderCard[] {
  return LEADER_SPECS.flatMap((spec) => {
    const best = rows.reduce<{ row: SupportDimensionRow; value: number } | null>(
      (top, row) => {
        const value = toNumber(spec.pick(row));
        return top === null || value > top.value ? { row, value } : top;
      },
      null,
    );

    if (best === null || best.value <= 0) return [];

    return [{
      id: spec.id,
      label: spec.label,
      name: best.row.name,
      value: spec.format(best.value),
      caption: spec.caption(best.row),
      color: spec.color,
    }];
  });
}

// --- Vocabulario ------------------------------------------------------------

export interface TimeMeasureMeta {
  label: string;
  caption: string;
  color: Extract<MetricColor, 'blue' | 'purple' | 'slate' | 'red' | 'green' | 'yellow'>;
}

/**
 * The eight measures with their reading. The colour encodes the formula, not
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
  close_created_resolved: { label: 'Cierre total · Resueltos', caption: 'Creación → cierre · cerrados en el mes', color: 'green' },
  close_created_cancelled: { label: 'Cierre total · Cancelados', caption: 'Creación → cierre · cerrados en el mes', color: 'red' },
  close_created_closed: { label: 'Cierre total · Todos', caption: 'Creación → cierre · cerrados en el mes', color: 'blue' },

  close_assigned_resolved: { label: 'Gestión · Resueltos', caption: 'Asignación → cierre · cerrados en el mes', color: 'green' },
  close_assigned_cancelled: { label: 'Gestión · Cancelados', caption: 'Asignación → cierre · cerrados en el mes', color: 'red' },
  close_assigned_closed: { label: 'Gestión · Todos', caption: 'Asignación → cierre · cerrados en el mes', color: 'purple' },

  assignment: { label: 'Tiempo de Asignación', caption: 'Creación → asignación (o → fin del periodo si sigue sin asignar) · creados en el mes', color: 'slate' },

  escalation: { label: 'Hasta escalar', caption: 'Creación → paso a Soporte · escalados en el mes', color: 'yellow' },
};

/** The two clocks the summary panels lead with, one per formula. */
export const CLOSE_TOTAL: SupportTimeMeasure = 'close_created_closed';
export const HANDLING: SupportTimeMeasure = 'close_assigned_closed';
export const ASSIGNMENT: SupportTimeMeasure = 'assignment';
export const ESCALATION: SupportTimeMeasure = 'escalation';

/**
 * El nombre de cada eje. `asignado_a` y `creado_por` se etiquetan con el
 * momento del ticket que miden —el cierre y la apertura— porque son dos
 * personas distintas y la tabla que los lee es la misma: sin eso, "Creados"
 * bajo el asignado se leía como los tickets que esa persona abrió.
 */
export const SUPPORT_DIMENSION_LABELS = {
  zona: 'Zona',
  sucursal: 'Sucursal',
  asignado_a: 'Asignado a',
  creado_por: 'Creado por',
} as const;

/** Qué mide cada eje, para el subtítulo de la tabla de dimensión. */
export const SUPPORT_DIMENSION_CAPTIONS: Record<SupportDimension, string> = {
  zona: 'dónde ocurrió el ticket',
  sucursal: 'dónde ocurrió el ticket',
  asignado_a: 'quién responde del ticket · mide el trabajo despachado',
  creado_por: 'quién abrió el ticket en Odoo · mide la demanda registrada',
};

export const SUPPORT_BREAKDOWN_LABELS = {
  tipo_solicitud: 'Tipo de ticket',
  razon_falla: 'Razón de la falla',
  solucion_falla: 'Solución aplicada',
} as const;
