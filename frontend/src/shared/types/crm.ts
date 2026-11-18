/**
 * Wire types of the CRM module: the rows the Django views send, as they arrive.
 *
 * They live here rather than in `features/crm/types` because `shared/lib/api`
 * types its responses with them and may not depend on a feature. The feature
 * re-exports them, so `@/features/crm/types` stays the single import site.
 */

export interface CrmHistoryRow {
  report_period?: string;
  total_opportunities?: number;
  won?: number;
  lost?: number;
  pending?: number;
  count_returned_e8?: number;
  pct_installation?: number;
  pct_lost?: number;
  pct_pending?: number;
  pct_returned_e8?: number;
  /**
   * Desglose del riesgo de devolución. `pct_devueltos_e8` son las transiciones
   * a la etapa 8 del mes sobre `total_en_riesgo` —todo lo que tuvo vida en el
   * periodo, creado en él o arrastrado de meses anteriores—, ya sin los motivos
   * ajenos a la gestión; `*_bruto` es lo mismo sin depurar, y la diferencia
   * entre ambos es `e8_devueltos_excepcion`. `e8_devueltos_estimados` es la
   * parte imputada a las devoluciones cuyo motivo ya no es legible:
   * estimación, no dato.
   */
  total_at_risk?: number;
  count_returned_e8_gross?: number;
  pct_returned_e8_gross?: number;
  e8_returned_exception?: number;
  e8_returned_with_reason?: number;
  e8_returned_without_reason?: number;
  e8_returned_estimated?: number;
  /** Oportunidades distintas detrás de las transiciones, y cuántas repitieron. */
  e8_returned_clients?: number;
  e8_repeat?: number;
  hours_avg_inst?: number;
  hours_median_inst?: number;
  hours_p25_inst?: number;
  hours_p75_inst?: number;
  hours_min_inst?: number;
  hours_max_inst?: number;
  hours_std_inst?: number;
  pct_over_avg_inst?: number;
  hours_avg_lost?: number;
  hours_median_lost?: number;
  hours_p25_lost?: number;
  hours_p75_lost?: number;
  hours_min_lost?: number;
  hours_max_lost?: number;
  hours_std_lost?: number;
  pct_over_avg_lost?: number;
  hours_avg_close?: number;
  hours_median_close?: number;
  hours_p25_close?: number;
  hours_p75_close?: number;
  hours_min_close?: number;
  hours_max_close?: number;
  hours_std_close?: number;
  pct_over_avg_close?: number;
  /** Per-stage effectiveness of the period, stored as JSONB on the cierre row. */
  effectiveness?: CrmEffectivenessRow[];
  /** Per-stage dwell time of the period, stored as JSONB on the cierre row. */
  time_by_stage?: CrmStageTimeRow[];
}

/**
 * How a stage's exits ended, and how long each kind took.
 *
 * `avance` moved on down the funnel, `retorno` went back to an earlier queue,
 * `devolucion` ended in stage 8. They are disjoint but need not add up to the
 * stage total: an exit to stage 9, 10 or `perdido` is none of the three.
 */
export interface CrmStageTimeOutcome {
  movements?: number;
  /** Share of the stage's exits, already in percent. */
  pct?: number;
  avg_hours?: number;
  median_hours?: number;
}

/**
 * Stays in a stage that have produced no exit yet.
 *
 * `cerradas_en_etapa` ended at the opportunity's closing date and never move
 * again; `abiertas` are measured against the clock, so they age between runs.
 */
export interface CrmStageTimeStay {
  total?: number;
  open?: number;
  closed_in_stage?: number;
  avg_hours?: number;
  adjusted_avg_hours?: number;
  median_hours?: number;
  p75_hours?: number;
  max_hours?: number;
}

/**
 * Exits and open stays together — what the stage actually costs, with nothing
 * dropped for the sake of having finished.
 */
export interface CrmStageTimeCombined {
  total?: number;
  avg_hours?: number;
  adjusted_avg_hours?: number;
  median_hours?: number;
  p75_hours?: number;
  /** Share of the figure coming from opportunities that have not left yet. */
  pct_no_exit?: number;
  /** ISO instant the open stays were measured against. */
  cut?: string;
}

/** A row of `tiempo_por_etapa`: one stage's dwell-time distribution. */
export interface CrmStageTimeRow {
  stage?: string;
  /** Set by the analysis for the stages sales steers by (1, 2, 3, 5 and 8). */
  is_key?: boolean;
  total_movements?: number;
  /** Distinct opportunities behind those moves — a stage can be re-entered. */
  total_opportunities?: number;
  movements_per_opportunity?: number;
  /** False when the stage has too few exits for its time to be read. */
  enough_sample?: boolean;

  /** Raw arithmetic mean — kept to show how far the tail drags it. */
  /** Sum of the exit durations — the numerator of `tiempo_promedio_horas`. */
  time_total_hours?: number;
  time_avg_hours?: number;
  /** Mean with the top tail winsorized: the figure to read as "the stage". */
  time_adjusted_avg_hours?: number;
  outlier_cutoff_hours?: number;
  total_outliers?: number;
  pct_outliers?: number;

  time_median_hours?: number;
  time_p25_hours?: number;
  time_p75_hours?: number;
  time_min_hours?: number;
  time_max_hours?: number;
  time_std_hours?: number;
  pct_over_avg?: number;

  instant_movements?: number;
  pct_instant?: number;
  /** Moves of exactly zero duration, left out of the mean on both sides. */
  null_movements?: number;

  progress?: CrmStageTimeOutcome;
  comeback?: CrmStageTimeOutcome;
  returns?: CrmStageTimeOutcome;

  /** Stays still open, or ended by the opportunity closing inside the stage. */
  tenure?: CrmStageTimeStay;
  /** The unbiased figure: exits plus open stays. Read this one. */
  combined?: CrmStageTimeCombined;
}

/**
 * A closed monthly cohort as sent to the Results page — the same fields as
 * `CrmHistoryRow`, but the endpoint guarantees every one of them.
 */
export type CrmClose = Required<CrmHistoryRow>;

export interface CrmEffectivenessRow {
  stage?: string;
  effectiveness_pct?: number;
  successful?: number;
  failed?: number;
  total_exits?: number;
}

/**
 * Metric block stored per dimension value. It is the same computation as a
 * monthly cierre row, run over the slice of opportunities belonging to one
 * branch / campaign / seller — so it carries the same measures, minus the
 * period itself.
 */
export type CrmMetrics = Omit<CrmHistoryRow, 'report_period'>;

/** A row of `crm_dimensiones_historico`, as the analytics endpoint sends it. */
export interface CrmDimensionRow {
  report_period: string;
  dimension: string;
  value: string;
  metrics: CrmMetrics;
  effectiveness: CrmEffectivenessRow[];
}

/**
 * One dimension value with its metrics hoisted to the top level — the shape the
 * charts and the detail table read, so neither has to reach through `metricas`.
 */
export type CrmDimensionValue = CrmMetrics & {
  value: string;
  effectiveness: CrmEffectivenessRow[];
};

/** Payload of `GET /crm/api/dimension-metrics/`. */
export interface CrmDimensionsResponse {
  dimensions: CrmDimensionRow[];
}
