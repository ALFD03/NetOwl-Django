import type { MetricColor } from '@/shared/ui';
import { crmEtapaLabel } from '@/shared/constants/labels';
import { toNumber } from '@/shared/utils/formatters';
import type { CrmDimensionValue, CrmTiempoEtapaRow } from '../types';

/**
 * A duration in the unit that carries its own resolution: minutes below the
 * hour, hours up to two days, days beyond that.
 *
 * `0.3 h` is a number the reader has to convert before it means anything, and a
 * stage that takes 380 h says nothing out loud where 15.8 d does. The cuts sit
 * where each unit stops reading: at 1 h the hour figure is all decimals, at
 * 48 h the hour figure is all magnitude.
 */
export function formatHoras(horas: number): string {
  if (!Number.isFinite(horas) || horas <= 0) return '0 h';
  if (horas >= 48) return `${(horas / 24).toFixed(1)} d`;
  if (horas >= 1) return `${horas.toFixed(1)} h`;

  // Rounding to the minute can reach zero from a real duration; the reading is
  // "shorter than a minute", never "no time at all".
  const minutos = Math.round(horas * 60);
  return minutos < 1 ? '<1 min' : `${minutos} min`;
}

/** The one stage's row out of a `tiempo_por_etapa` list. */
export function findEtapaTiempo(
  rows: CrmTiempoEtapaRow[] = [],
  etapa: string,
): CrmTiempoEtapaRow | undefined {
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
export function tiempoEtapa(row?: CrmTiempoEtapaRow): number {
  return toNumber(row?.tiempo_promedio_horas);
}

/** Sum of the exit durations — the numerator behind `tiempoEtapa`. */
export function sumaHorasEtapa(row?: CrmTiempoEtapaRow): number {
  return toNumber(row?.tiempo_total_horas);
}

/** Median of the same exits. */
export function medianaEtapa(row?: CrmTiempoEtapaRow): number {
  return toNumber(row?.tiempo_mediana_horas);
}

/** P75 of the same exits. */
export function p75Etapa(row?: CrmTiempoEtapaRow): number {
  return toNumber(row?.tiempo_p75_horas);
}

/** Transitions out of the stage — the denominator behind `tiempoEtapa`. */
export function muestraEtapa(row?: CrmTiempoEtapaRow): number {
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
  sumaHoras: number;
  /** Moves of exactly zero duration — outside the mean, on both sides of it. */
  nulos: number;
  oportunidades: number;
  /** Re-entries: > 1 means the stage is being worked more than once per deal. */
  movimientosPorOportunidad: number;
  fiable: boolean;

  /** Stays with no exit yet, and the split between the two ways of ending. */
  sinSalida: number;
  /** Still open, measured against the clock — this is what ages between runs. */
  sinSalidaAbiertas: number;
  /** Died inside the stage, measured to the closing date — reproducible. */
  sinSalidaCerradas: number;
  pctSinSalida: number;
  horasSinSalida: number;

  /** Shares of the exits alone, so they do not sum with `pctSinSalida`. */
  pctAvance: number;
  pctRetorno: number;
  pctDevolucion: number;
  horasAvance: number;
  horasDevolucion: number;
  accent: MetricColor;
}

/**
 * Accent per stage, so a card and its column in the breakdown read as the same
 * thing. An explicit map — the tones are identity, not a scale.
 */
const ETAPA_ACCENT: Record<string, MetricColor> = {
  etapa_1_contacto: 'blue',
  etapa_2_recepcion: 'purple',
  etapa_3_factibilidad: 'green',
  etapa_4_adecuaciones: 'slate',
  etapa_5_gpi: 'yellow',
  etapa_6_contratistas: 'slate',
  etapa_8_devueltos: 'red',
};

export function buildStageTimeCards(
  tiempoPorEtapa: CrmTiempoEtapaRow[] = [],
  etapas: readonly string[],
): CrmStageTimeCard[] {
  return etapas.map((etapa) => {
    const row = findEtapaTiempo(tiempoPorEtapa, etapa);

    return {
      etapa,
      label: crmEtapaLabel(etapa),
      promedio: tiempoEtapa(row),
      mediana: medianaEtapa(row),
      p75: p75Etapa(row),
      muestra: muestraEtapa(row),
      movimientos: toNumber(row?.total_movimientos),
      sumaHoras: sumaHorasEtapa(row),
      nulos: toNumber(row?.movimientos_nulos),
      oportunidades: toNumber(row?.total_oportunidades),
      movimientosPorOportunidad: toNumber(row?.movimientos_por_oportunidad),
      // A row the analysis never produced is not "reliable and empty".
      fiable: row ? row.muestra_suficiente !== false : false,

      sinSalida: toNumber(row?.permanencia?.total),
      sinSalidaAbiertas: toNumber(row?.permanencia?.abiertas),
      sinSalidaCerradas: toNumber(row?.permanencia?.cerradas_en_etapa),
      pctSinSalida: toNumber(row?.combinado?.pct_sin_salida),
      horasSinSalida: toNumber(row?.permanencia?.promedio_ajustado_horas),

      pctAvance: toNumber(row?.avance?.pct),
      pctRetorno: toNumber(row?.retorno?.pct),
      pctDevolucion: toNumber(row?.devolucion?.pct),
      horasAvance: toNumber(row?.avance?.promedio_horas),
      horasDevolucion: toNumber(row?.devolucion?.promedio_horas),
      accent: ETAPA_ACCENT[etapa] ?? 'slate',
    };
  });
}

/** The instant the open stays were measured against, out of any stage that has one. */
export function corteMedicion(tiempoPorEtapa: CrmTiempoEtapaRow[] = []): string | null {
  return tiempoPorEtapa.find((row) => row.combinado?.corte)?.combinado?.corte ?? null;
}

/** One dimension value's time in one stage, against the period's own figure. */
export interface CrmStageTimeDimensionRow {
  valor: string;
  /** Transitions out of the stage — the denominator of `promedio`. */
  muestra: number;
  movimientos: number;
  /** Sum of their durations — the numerator of `promedio`. */
  sumaHoras: number;
  sinSalida: number;
  pctSinSalida: number;
  oportunidades: number;
  promedio: number;
  mediana: number;
  p75: number;
  /** Percent off the period baseline. Positive is slower than the period. */
  variacionPct: number;
  pctAvance: number;
  pctDevolucion: number;
  /** Exits to stages 9/10: neither an advance nor a return inside the funnel. */
  pctOtro: number;
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
      const etapaRow = findEtapaTiempo(row.tiempo_por_etapa, etapa);
      const promedio = tiempoEtapa(etapaRow);

      return {
        valor: row.valor,
        muestra: muestraEtapa(etapaRow),
        movimientos: toNumber(etapaRow?.total_movimientos),
        sumaHoras: sumaHorasEtapa(etapaRow),
        sinSalida: toNumber(etapaRow?.permanencia?.total),
        pctSinSalida: toNumber(etapaRow?.combinado?.pct_sin_salida),
        oportunidades: toNumber(etapaRow?.total_oportunidades),
        promedio,
        mediana: medianaEtapa(etapaRow),
        p75: p75Etapa(etapaRow),
        variacionPct: baseline > 0 ? ((promedio - baseline) / baseline) * 100 : 0,
        pctAvance: toNumber(etapaRow?.avance?.pct),
        pctDevolucion: toNumber(etapaRow?.devolucion?.pct),
        // The remainder of the exits: what did not advance, return or bounce to
        // E8 left the funnel sideways (stages 9 and 10).
        pctOtro: Math.max(
          0,
          100 -
            toNumber(etapaRow?.avance?.pct) -
            toNumber(etapaRow?.retorno?.pct) -
            toNumber(etapaRow?.devolucion?.pct),
        ),
        fiable: etapaRow ? etapaRow.muestra_suficiente !== false : false,
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
