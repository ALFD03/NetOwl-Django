/**
 * Lectura de los bloques de métricas de soporte y etiquetas de cada medida.
 *
 * Las tres medidas de tiempo miden cosas distintas —el ciclo completo, solo la
 * gestión del técnico y la espera hasta la asignación— y es lo que distinguen
 * `CIERRE_TOTAL`, `GESTION` y `ASIGNACION`.
 */

import type { MetricColor } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals, toNumber } from '@/shared/utils';
import {
  SUPPORT_TIME_MEASURES,
  type SupportDepartamentoRow,
  type SupportDimension,
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
      departamento: entry.departamento ?? '',
    }))
    .sort((a, b) => toNumber(b.total_tickets) - toNumber(a.total_tickets));
}

// --- Agrupación por departamento --------------------------------------------

/** Cómo se llama en la tabla quien no está en el directorio de `/support/users/`. */
export const SIN_DEPARTAMENTO = 'Sin departamento';

/** Los volúmenes: se suman sin más, porque las personas parten los tickets. */
const VOLUME_KEYS = [
  'total_tickets', 'tickets_creados', 'tickets_cerrados',
  'tickets_resueltos', 'tickets_resueltos_periodo', 'tickets_resueltos_arrastre',
  'tickets_cancelados', 'tickets_cancelados_periodo', 'tickets_cancelados_arrastre',
  'tickets_rezagados',
] as const satisfies ReadonlyArray<keyof SupportStats>;

/**
 * Suma las filas de un eje de persona por el departamento de cada una.
 *
 * Los tres porqués de cada familia de cifras están en `SupportDepartamentoRow`.
 * `parentTotal` es el mismo denominador que usa la tabla de personas —el total
 * del grupo—, de modo que los dos `% del Total` se leen contra lo mismo.
 */
export function agruparPorDepartamento(
  rows: SupportDimensionRow[],
  parentTotal: number,
): SupportDepartamentoRow[] {
  const acumulado = new Map<string, { row: SupportDepartamentoRow; pesos: Map<string, number> }>();

  for (const row of rows) {
    const nombre = row.departamento || SIN_DEPARTAMENTO;
    let entrada = acumulado.get(nombre);
    if (entrada === undefined) {
      entrada = {
        row: { ...emptyStats(), nombre, pctDelPadre: 0, departamento: nombre, personas: 0 },
        pesos: new Map(),
      };
      acumulado.set(nombre, entrada);
    }

    entrada.row.personas += 1;
    for (const key of VOLUME_KEYS) {
      entrada.row[key] = toNumber(entrada.row[key]) + toNumber(row[key]);
    }

    // Media ponderada de los tiempos: se acumula suma(media × muestra) y la
    // muestra, y se divide al final. La media de las medias sin ponderar daría
    // el mismo peso a quien cerró tres tickets que a quien cerró trescientos.
    for (const medida of SUPPORT_TIME_MEASURES) {
      const muestra = toNumber(row[`muestra_${medida}`]);
      if (muestra <= 0) continue;
      const clave = `tiempo_medio_${medida}_horas` as const;
      entrada.row[clave] = toNumber(entrada.row[clave]) + toNumber(row[clave]) * muestra;
      entrada.pesos.set(medida, (entrada.pesos.get(medida) ?? 0) + muestra);
    }
  }

  return [...acumulado.values()]
    .map(({ row, pesos }) => {
      for (const medida of SUPPORT_TIME_MEASURES) {
        const muestra = pesos.get(medida) ?? 0;
        const clave = `tiempo_medio_${medida}_horas` as const;
        row[`muestra_${medida}`] = muestra;
        row[clave] = muestra > 0 ? Number((toNumber(row[clave]) / muestra).toFixed(2)) : 0;
      }

      // Las tasas se recalculan desde las sumas, nunca se promedian: cada una
      // trae fijado su denominador —lo cerrado en el mes, o lo creado— y
      // promediar porcentajes de personas con cargas distintas no da ninguno.
      const cerrados = toNumber(row.tickets_cerrados);
      const creados = toNumber(row.tickets_creados);
      row.pct_resueltos = share(toNumber(row.tickets_resueltos), cerrados);
      row.pct_resueltos_periodo = share(toNumber(row.tickets_resueltos_periodo), cerrados);
      row.pct_resueltos_arrastre = share(toNumber(row.tickets_resueltos_arrastre), cerrados);
      row.pct_cancelados = share(toNumber(row.tickets_cancelados), cerrados);
      row.pct_cancelados_periodo = share(toNumber(row.tickets_cancelados_periodo), cerrados);
      row.pct_cancelados_arrastre = share(toNumber(row.tickets_cancelados_arrastre), cerrados);
      row.pct_rezagados = share(toNumber(row.tickets_rezagados), creados);

      row.pctDelPadre = share(toNumber(row.total_tickets), parentTotal);
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
  nombre: string;
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
  format: (valor: number) => string;
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
    pick: (r) => r.pctDelPadre,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `${formatInteger(toNumber(r.total_tickets))} tickets`,
  },
  {
    id: 'resueltos',
    label: 'Tasa de resueltos más alta',
    color: 'green',
    pick: (r) => r.pct_resueltos,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `sobre ${formatInteger(toNumber(r.tickets_cerrados))} cerrados`,
  },
  {
    id: 'cancelados',
    label: 'Tasa de cancelados más alta',
    color: 'red',
    pick: (r) => r.pct_cancelados,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `sobre ${formatInteger(toNumber(r.tickets_cerrados))} cerrados`,
  },
  {
    id: 'rezagados',
    label: 'Tasa de rezago más alta',
    color: 'yellow',
    pick: (r) => r.pct_rezagados,
    format: (v) => `${formatTwoDecimals(v)}%`,
    caption: (r) => `sobre ${formatInteger(toNumber(r.tickets_creados))} creados`,
  },
  {
    id: 'cierre',
    label: 'Tiempo de cierre más alto',
    color: 'purple',
    pick: (r) => r.tiempo_medio_cierre_creado_cerrados_horas,
    format: (v) => `${formatOneDecimal(v)} h`,
    caption: (r) => `muestra ${formatInteger(toNumber(r.muestra_cierre_creado_cerrados))}`,
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
    const best = rows.reduce<{ row: SupportDimensionRow; valor: number } | null>(
      (top, row) => {
        const valor = toNumber(spec.pick(row));
        return top === null || valor > top.valor ? { row, valor } : top;
      },
      null,
    );

    if (best === null || best.valor <= 0) return [];

    return [{
      id: spec.id,
      label: spec.label,
      nombre: best.row.nombre,
      value: spec.format(best.valor),
      caption: spec.caption(best.row),
      color: spec.color,
    }];
  });
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

  asignacion: { label: 'Tiempo de Asignación', caption: 'Creación → asignación (o → fin del periodo si sigue sin asignar) · creados en el mes', color: 'slate' },
};

/** The two clocks the summary panels lead with, one per formula. */
export const CIERRE_TOTAL: SupportTimeMeasure = 'cierre_creado_cerrados';
export const GESTION: SupportTimeMeasure = 'cierre_asignado_cerrados';
export const ASIGNACION: SupportTimeMeasure = 'asignacion';

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

export const SUPPORT_DESGLOSE_LABELS = {
  tipo_solicitud: 'Tipo de ticket',
  razon_falla: 'Razón de la falla',
  solucion_falla: 'Solución aplicada',
} as const;
