/**
 * Lectura del tiempo por etapa: tarjetas, medianas y filas dimensionales.
 *
 * El backend publica por etapa el promedio crudo, uno ajustado (winsorizado), el
 * desglose por desenlace y las estancias que aún no han salido; aquí se elige
 * qué se enseña y cómo se etiqueta.
 */

import type { MetricColor } from '@/shared/ui';
import { crmStageLabel } from '@/shared/constants/labels';
import { toNumber } from '@/shared/utils/formatters';
import type { CrmDimensionValue, CrmStageTimeRow } from '../types';

/**
 * A duration in the unit that carries its own resolution: minutes below the
 * hour, hours up to two days, days beyond that.
 *
 * `0.3 h` is a number the reader has to convert before it means anything, and a
 * stage that takes 380 h says nothing out loud where 15.8 d does. The cuts sit
 * where each unit stops reading: at 1 h the hour figure is all decimals, at
 * 48 h the hour figure is all magnitude.
 */
export function formatHours(horas: number): string {
  if (!Number.isFinite(horas) || horas <= 0) return '0 h';
  if (horas >= 48) return `${(horas / 24).toFixed(1)} d`;
  if (horas >= 1) return `${horas.toFixed(1)} h`;

  // Rounding to the minute can reach zero from a real duration; the reading is
  // "shorter than a minute", never "no time at all".
  const minutos = Math.round(horas * 60);
  return minutos < 1 ? '<1 min' : `${minutos} min`;
}

/** The one stage's row out of a `tiempo_por_etapa` list. */
export function findStageTime(
  rows: CrmStageTimeRow[] = [],
  etapa: string,
): CrmStageTimeRow | undefined {
  return rows.find((row) => row.etapa === etapa);
}

/**
 * What the stage costs: the plain mean of every exit out of it — the sum of the
 * logged durations divided by the number of transitions.
 *
 * Deliberately the raw mean and not the winsorized one: the figure has to be
 * reproducible by hand against the log. `tiempo_total_horas` carries the
 * numerator so it can be checked.
 */
export function stageTime(row?: CrmStageTimeRow): number {
  return toNumber(row?.tiempo_promedio_horas);
}

/** Sum of the exit durations — the numerator behind `stageTime`. */
export function stageHoursTotal(row?: CrmStageTimeRow): number {
  return toNumber(row?.tiempo_total_horas);
}

/** Median of the same exits. */
export function stageMedian(row?: CrmStageTimeRow): number {
  return toNumber(row?.tiempo_mediana_horas);
}

/** P75 of the same exits. */
export function stageP75(row?: CrmStageTimeRow): number {
  return toNumber(row?.tiempo_p75_horas);
}

/** Transitions out of the stage — the denominator behind `stageTime`. */
export function stageSample(row?: CrmStageTimeRow): number {
  return toNumber(row?.total_movimientos);
}

/** A key stage's readout for the period as a whole. */
export interface CrmStageTimeCard {
  etapa: string;
  label: string;
  /** Winsorized mean over exits and open stays together — the headline. */
  promedio: number;
  mediana: number;
  p75: number;
  /** Transitions out of the stage: the denominator of `promedio`. */
  muestra: number;
  /** Same figure, kept under its wire name. */
  movimientos: number;
  /** Sum of those transitions' durations: the numerator of `promedio`. */
  hoursTotal: number;
  /** Moves of exactly zero duration — outside the mean, on both sides of it. */
  nulos: number;
  oportunidades: number;
  /** Re-entries: > 1 means the stage is being worked more than once per deal. */
  movesPerOpportunity: number;
  fiable: boolean;

  /** Stays with no exit yet, and the split between the two ways of ending. */
  noExit: number;
  /** Still open, measured against the clock — this is what ages between runs. */
  noExitOpen: number;
  /** Died inside the stage, measured to the closing date — reproducible. */
  noExitClosed: number;
  pctNoExit: number;
  noExitHours: number;

  /** Shares of the exits alone, so they do not sum with `pctNoExit`. */
  pctAvance: number;
  pctRetorno: number;
  pctDevolucion: number;
  advanceHours: number;
  returnHours: number;
  accent: MetricColor;
}

/**
 * Accent per stage, so a card and its column in the breakdown read as the same
 * thing. An explicit map — the tones are identity, not a scale.
 */
const STAGE_ACCENT: Record<string, MetricColor> = {
  etapa_1_contacto: 'blue',
  etapa_2_recepcion: 'purple',
  etapa_3_factibilidad: 'green',
  etapa_4_adecuaciones: 'slate',
  etapa_5_gpi: 'yellow',
  etapa_6_contratistas: 'slate',
  etapa_8_devueltos: 'red',
};

export function buildStageTimeCards(
  timeByStage: CrmStageTimeRow[] = [],
  etapas: readonly string[],
): CrmStageTimeCard[] {
  return etapas.map((etapa) => {
    const row = findStageTime(timeByStage, etapa);

    return {
      etapa,
      label: crmStageLabel(etapa),
      promedio: stageTime(row),
      mediana: stageMedian(row),
      p75: stageP75(row),
      muestra: stageSample(row),
      movimientos: toNumber(row?.total_movimientos),
      hoursTotal: stageHoursTotal(row),
      nulos: toNumber(row?.movimientos_nulos),
      oportunidades: toNumber(row?.total_oportunidades),
      movesPerOpportunity: toNumber(row?.movimientos_por_oportunidad),
      // A row the analysis never produced is not "reliable and empty".
      fiable: row ? row.muestra_suficiente !== false : false,

      noExit: toNumber(row?.permanencia?.total),
      noExitOpen: toNumber(row?.permanencia?.abiertas),
      noExitClosed: toNumber(row?.permanencia?.cerradas_en_etapa),
      pctNoExit: toNumber(row?.combinado?.pct_sin_salida),
      noExitHours: toNumber(row?.permanencia?.promedio_ajustado_horas),

      pctAvance: toNumber(row?.avance?.pct),
      pctRetorno: toNumber(row?.retorno?.pct),
      pctDevolucion: toNumber(row?.devolucion?.pct),
      advanceHours: toNumber(row?.avance?.promedio_horas),
      returnHours: toNumber(row?.devolucion?.promedio_horas),
      accent: STAGE_ACCENT[etapa] ?? 'slate',
    };
  });
}

/** The instant the open stays were measured against, out of any stage that has one. */
export function measurementCutoff(timeByStage: CrmStageTimeRow[] = []): string | null {
  return timeByStage.find((row) => row.combinado?.corte)?.combinado?.corte ?? null;
}

/** One dimension value's time in one stage, against the period's own figure. */
export interface CrmStageTimeDimensionRow {
  valor: string;
  /** Transitions out of the stage — the denominator of `promedio`. */
  muestra: number;
  movimientos: number;
  /** Sum of their durations — the numerator of `promedio`. */
  hoursTotal: number;
  noExit: number;
  pctNoExit: number;
  oportunidades: number;
  promedio: number;
  mediana: number;
  p75: number;
  /** Percent off the period baseline. Positive is slower than the period. */
  variacionPct: number;
  pctAvance: number;
  pctDevolucion: number;
  /** Exits to stages 9/10: neither an advance nor a return inside the funnel. */
  pctOther: number;
  fiable: boolean;
}

/**
 * Every dimension value's time in one stage, fastest first.
 *
 * Values with nothing to measure in the stage are dropped rather than shown as
 * an instant zero: they have no measurement, not a good one. A value with only
 * stuck opportunities and no exit at all does have one, and is exactly the case
 * this section exists to surface.
 */
export function buildStageTimeDimensionRows(
  rows: CrmDimensionValue[],
  etapa: string,
  baseline: number,
): CrmStageTimeDimensionRow[] {
  return rows
    .map((row) => {
      const stageRow = findStageTime(row.tiempo_por_etapa, etapa);
      const promedio = stageTime(stageRow);

      return {
        valor: row.valor,
        muestra: stageSample(stageRow),
        movimientos: toNumber(stageRow?.total_movimientos),
        hoursTotal: stageHoursTotal(stageRow),
        noExit: toNumber(stageRow?.permanencia?.total),
        pctNoExit: toNumber(stageRow?.combinado?.pct_sin_salida),
        oportunidades: toNumber(stageRow?.total_oportunidades),
        promedio,
        mediana: stageMedian(stageRow),
        p75: stageP75(stageRow),
        variacionPct: baseline > 0 ? ((promedio - baseline) / baseline) * 100 : 0,
        pctAvance: toNumber(stageRow?.avance?.pct),
        pctDevolucion: toNumber(stageRow?.devolucion?.pct),
        // The remainder of the exits: what did not advance, return or bounce to
        // E8 left the funnel sideways (stages 9 and 10).
        pctOther: Math.max(
          0,
          100 -
            toNumber(stageRow?.avance?.pct) -
            toNumber(stageRow?.retorno?.pct) -
            toNumber(stageRow?.devolucion?.pct),
        ),
        fiable: stageRow ? stageRow.muestra_suficiente !== false : false,
      };
    })
    // Nothing left the stage: there is no sum to divide, so there is no time.
    // The stalled count still shows on the card, which is where it belongs.
    .filter((row) => row.muestra > 0)
    .sort((a, b) => a.promedio - b.promedio);
}

/**
 * Tone of a variation against the baseline. Faster is better in every stage
 * this section covers, so the scale is one-directional; ±15 % is noise.
 */
export function variacionColor(variacionPct: number): MetricColor {
  if (variacionPct <= -15) return 'green';
  if (variacionPct >= 15) return 'red';
  return 'slate';
}

/** `-23.4 %` / `+8.1 %`, with the sign kept — it is the whole message. */
export function formatVariacion(variacionPct: number): string {
  const signo = variacionPct > 0 ? '+' : '';
  return `${signo}${variacionPct.toFixed(1)}%`;
}

/**
 * Fastest and slowest values of a stage, out of the reliable rows alone.
 *
 * A single reliable value is not both ends of the ranking: with nothing to
 * compare it against there is no slowest, so `comparable` is false and only the
 * one measurement is returned.
 */
export function stageTimeLeaders(rows: CrmStageTimeDimensionRow[]): {
  rapida: CrmStageTimeDimensionRow | null;
  lenta: CrmStageTimeDimensionRow | null;
  comparable: boolean;
} {
  // A value with three exits will top or bottom the ranking on noise alone.
  const fiables = rows.filter((row) => row.fiable && row.promedio > 0);
  if (fiables.length === 0) return { rapida: null, lenta: null, comparable: false };
  if (fiables.length === 1) return { rapida: fiables[0], lenta: null, comparable: false };

  return { rapida: fiables[0], lenta: fiables[fiables.length - 1], comparable: true };
}
