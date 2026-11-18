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
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 h';
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`;
  if (hours >= 1) return `${hours.toFixed(1)} h`;

  // Rounding to the minute can reach zero from a real duration; the reading is
  // "shorter than a minute", never "no time at all".
  const minutos = Math.round(hours * 60);
  return minutos < 1 ? '<1 min' : `${minutos} min`;
}

/** The one stage's row out of a `time_by_stage` list. */
export function findStageTime(
  rows: CrmStageTimeRow[] = [],
  stageId: string,
): CrmStageTimeRow | undefined {
  return rows.find((row) => row.stage === stageId);
}

/**
 * What the stage costs: the plain mean of every exit out of it — the sum of the
 * logged durations divided by the number of transitions.
 *
 * Deliberately the raw mean and not the winsorized one: the figure has to be
 * reproducible by hand against the log. `time_total_hours` carries the
 * numerator so it can be checked.
 */
export function stageTime(row?: CrmStageTimeRow): number {
  return toNumber(row?.time_avg_hours);
}

/** Sum of the exit durations — the numerator behind `stageTime`. */
export function stageHoursTotal(row?: CrmStageTimeRow): number {
  return toNumber(row?.time_total_hours);
}

/** Median of the same exits. */
export function stageMedian(row?: CrmStageTimeRow): number {
  return toNumber(row?.time_median_hours);
}

/** P75 of the same exits. */
export function stageP75(row?: CrmStageTimeRow): number {
  return toNumber(row?.time_p75_hours);
}

/** Transitions out of the stage — the denominator behind `stageTime`. */
export function stageSample(row?: CrmStageTimeRow): number {
  return toNumber(row?.total_movements);
}

/** A key stage's readout for the period as a whole. */
export interface CrmStageTimeCard {
  stage: string;
  label: string;
  /** Winsorized mean over exits and open stays together — the headline. */
  avg: number;
  median: number;
  p75: number;
  /** Transitions out of the stage: the denominator of `avg`. */
  sample: number;
  /** Same figure, kept under its wire name. */
  movements: number;
  /** Sum of those transitions' durations: the numerator of `avg`. */
  hoursTotal: number;
  /** Moves of exactly zero duration — outside the mean, on both sides of it. */
  nulls: number;
  opportunities: number;
  /** Re-entries: > 1 means the stage is being worked more than once per deal. */
  movesPerOpportunity: number;
  reliable: boolean;

  /** Stays with no exit yet, and the split between the two ways of ending. */
  noExit: number;
  /** Still open, measured against the clock — this is what ages between runs. */
  noExitOpen: number;
  /** Died inside the stage, measured to the closing date — reproducible. */
  noExitClosed: number;
  pctNoExit: number;
  noExitHours: number;

  /** Shares of the exits alone, so they do not sum with `pctNoExit`. */
  pctProgress: number;
  pctComeback: number;
  pctReturns: number;
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
  stages: readonly string[],
): CrmStageTimeCard[] {
  return stages.map((stageId) => {
    const row = findStageTime(timeByStage, stageId);

    return {
      stage: stageId,
      label: crmStageLabel(stageId),
      avg: stageTime(row),
      median: stageMedian(row),
      p75: stageP75(row),
      sample: stageSample(row),
      movements: toNumber(row?.total_movements),
      hoursTotal: stageHoursTotal(row),
      nulls: toNumber(row?.null_movements),
      opportunities: toNumber(row?.total_opportunities),
      movesPerOpportunity: toNumber(row?.movements_per_opportunity),
      // A row the analysis never produced is not "reliable and empty".
      reliable: row ? row.enough_sample !== false : false,

      noExit: toNumber(row?.tenure?.total),
      noExitOpen: toNumber(row?.tenure?.open),
      noExitClosed: toNumber(row?.tenure?.closed_in_stage),
      pctNoExit: toNumber(row?.combined?.pct_no_exit),
      noExitHours: toNumber(row?.tenure?.adjusted_avg_hours),

      pctProgress: toNumber(row?.progress?.pct),
      pctComeback: toNumber(row?.comeback?.pct),
      pctReturns: toNumber(row?.returns?.pct),
      advanceHours: toNumber(row?.progress?.avg_hours),
      returnHours: toNumber(row?.returns?.avg_hours),
      accent: STAGE_ACCENT[stageId] ?? 'slate',
    };
  });
}

/** The instant the open stays were measured against, out of any stage that has one. */
export function measurementCutoff(timeByStage: CrmStageTimeRow[] = []): string | null {
  return timeByStage.find((row) => row.combined?.cut)?.combined?.cut ?? null;
}

/** One dimension value's time in one stage, against the period's own figure. */
export interface CrmStageTimeDimensionRow {
  value: string;
  /** Transitions out of the stage — the denominator of `avg`. */
  sample: number;
  movements: number;
  /** Sum of their durations — the numerator of `avg`. */
  hoursTotal: number;
  noExit: number;
  pctNoExit: number;
  opportunities: number;
  avg: number;
  median: number;
  p75: number;
  /** Percent off the period baseline. Positive is slower than the period. */
  changePct: number;
  pctProgress: number;
  pctReturns: number;
  /** Exits to stages 9/10: neither an advance nor a return inside the funnel. */
  pctOther: number;
  reliable: boolean;
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
  stageId: string,
  baseline: number,
): CrmStageTimeDimensionRow[] {
  return rows
    .map((row) => {
      const stageRow = findStageTime(row.time_by_stage, stageId);
      const mean = stageTime(stageRow);

      return {
        value: row.value,
        sample: stageSample(stageRow),
        movements: toNumber(stageRow?.total_movements),
        hoursTotal: stageHoursTotal(stageRow),
        noExit: toNumber(stageRow?.tenure?.total),
        pctNoExit: toNumber(stageRow?.combined?.pct_no_exit),
        opportunities: toNumber(stageRow?.total_opportunities),
        avg: mean,
        median: stageMedian(stageRow),
        p75: stageP75(stageRow),
        changePct: baseline > 0 ? ((mean - baseline) / baseline) * 100 : 0,
        pctProgress: toNumber(stageRow?.progress?.pct),
        pctReturns: toNumber(stageRow?.returns?.pct),
        // The remainder of the exits: what did not advance, return or bounce to
        // E8 left the funnel sideways (stages 9 and 10).
        pctOther: Math.max(
          0,
          100 -
            toNumber(stageRow?.progress?.pct) -
            toNumber(stageRow?.comeback?.pct) -
            toNumber(stageRow?.returns?.pct),
        ),
        reliable: stageRow ? stageRow.enough_sample !== false : false,
      };
    })
    // Nothing left the stage: there is no sum to divide, so there is no time.
    // The stalled count still shows on the card, which is where it belongs.
    .filter((row) => row.sample > 0)
    .sort((a, b) => a.avg - b.avg);
}

/**
 * Tone of a variation against the baseline. Faster is better in every stage
 * this section covers, so the scale is one-directional; ±15 % is noise.
 */
export function changeColor(variacionPct: number): MetricColor {
  if (variacionPct <= -15) return 'green';
  if (variacionPct >= 15) return 'red';
  return 'slate';
}

/** `-23.4 %` / `+8.1 %`, with the sign kept — it is the whole message. */
export function formatChange(variacionPct: number): string {
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
  fast: CrmStageTimeDimensionRow | null;
  slow: CrmStageTimeDimensionRow | null;
  comparable: boolean;
} {
  // A value with three exits will top or bottom the ranking on noise alone.
  const fiables = rows.filter((row) => row.reliable && row.avg > 0);
  if (fiables.length === 0) return { fast: null, slow: null, comparable: false };
  if (fiables.length === 1) return { fast: fiables[0], slow: null, comparable: false };

  return { fast: fiables[0], slow: fiables[fiables.length - 1], comparable: true };
}
