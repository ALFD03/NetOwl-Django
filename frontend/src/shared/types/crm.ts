/**
 * Wire types of the CRM module: the rows the Django views send, as they arrive.
 *
 * They live here rather than in `features/crm/types` because `shared/lib/api`
 * types its responses with them and may not depend on a feature. The feature
 * re-exports them, so `@/features/crm/types` stays the single import site.
 */

export interface CrmHistoricoRow {
  periodo_reporte?: string;
  total_oportunidades?: number;
  ganados?: number;
  perdidos?: number;
  pendientes?: number;
  count_devueltos_e8?: number;
  pct_instalacion?: number;
  pct_perdida?: number;
  pct_pendientes?: number;
  pct_devueltos_e8?: number;
  horas_promedio_inst?: number;
  horas_mediana_inst?: number;
  horas_p25_inst?: number;
  horas_p75_inst?: number;
  horas_min_inst?: number;
  horas_max_inst?: number;
  horas_std_inst?: number;
  pct_excede_prom_inst?: number;
  horas_promedio_perd?: number;
  horas_mediana_perd?: number;
  horas_p25_perd?: number;
  horas_p75_perd?: number;
  horas_min_perd?: number;
  horas_max_perd?: number;
  horas_std_perd?: number;
  pct_excede_prom_perd?: number;
  horas_promedio_cierre?: number;
  horas_mediana_cierre?: number;
  horas_p25_cierre?: number;
  horas_p75_cierre?: number;
  horas_min_cierre?: number;
  horas_max_cierre?: number;
  horas_std_cierre?: number;
  pct_excede_prom_cierre?: number;
  /** Per-stage effectiveness of the period, stored as JSONB on the cierre row. */
  efectividad?: CrmEfectividadRow[];
  /** Per-stage dwell time of the period, stored as JSONB on the cierre row. */
  tiempo_por_etapa?: CrmTiempoEtapaRow[];
}

/**
 * How a stage's exits ended, and how long each kind took.
 *
 * `avance` moved on down the funnel, `retorno` went back to an earlier queue,
 * `devolucion` ended in stage 8. They are disjoint but need not add up to the
 * stage total: an exit to stage 9, 10 or `perdido` is none of the three.
 */
export interface CrmTiempoEtapaDesenlace {
  movimientos?: number;
  /** Share of the stage's exits, already in percent. */
  pct?: number;
  promedio_horas?: number;
  mediana_horas?: number;
}

/**
 * Stays in a stage that have produced no exit yet.
 *
 * `cerradas_en_etapa` ended at the opportunity's closing date and never move
 * again; `abiertas` are measured against the clock, so they age between runs.
 */
export interface CrmTiempoEtapaPermanencia {
  total?: number;
  abiertas?: number;
  cerradas_en_etapa?: number;
  promedio_horas?: number;
  promedio_ajustado_horas?: number;
  mediana_horas?: number;
  p75_horas?: number;
  max_horas?: number;
}

/**
 * Exits and open stays together — what the stage actually costs, with nothing
 * dropped for the sake of having finished.
 */
export interface CrmTiempoEtapaCombinado {
  total?: number;
  promedio_horas?: number;
  promedio_ajustado_horas?: number;
  mediana_horas?: number;
  p75_horas?: number;
  /** Share of the figure coming from opportunities that have not left yet. */
  pct_sin_salida?: number;
  /** ISO instant the open stays were measured against. */
  corte?: string;
}

/** A row of `tiempo_por_etapa`: one stage's dwell-time distribution. */
export interface CrmTiempoEtapaRow {
  etapa?: string;
  /** Set by the analysis for the stages sales steers by (1, 2, 3, 5 and 8). */
  es_clave?: boolean;
  total_movimientos?: number;
  /** Distinct opportunities behind those moves — a stage can be re-entered. */
  total_oportunidades?: number;
  movimientos_por_oportunidad?: number;
  /** False when the stage has too few exits for its time to be read. */
  muestra_suficiente?: boolean;

  /** Raw arithmetic mean — kept to show how far the tail drags it. */
  /** Sum of the exit durations — the numerator of `tiempo_promedio_horas`. */
  tiempo_total_horas?: number;
  tiempo_promedio_horas?: number;
  /** Mean with the top tail winsorized: the figure to read as "the stage". */
  tiempo_promedio_ajustado_horas?: number;
  tiempo_corte_outlier_horas?: number;
  total_outliers?: number;
  pct_outliers?: number;

  tiempo_mediana_horas?: number;
  tiempo_p25_horas?: number;
  tiempo_p75_horas?: number;
  tiempo_min_horas?: number;
  tiempo_max_horas?: number;
  tiempo_std_horas?: number;
  pct_excede_promedio?: number;

  movimientos_instantaneos?: number;
  pct_instantaneos?: number;
  /** Moves of exactly zero duration, left out of the mean on both sides. */
  movimientos_nulos?: number;

  avance?: CrmTiempoEtapaDesenlace;
  retorno?: CrmTiempoEtapaDesenlace;
  devolucion?: CrmTiempoEtapaDesenlace;

  /** Stays still open, or ended by the opportunity closing inside the stage. */
  permanencia?: CrmTiempoEtapaPermanencia;
  /** The unbiased figure: exits plus open stays. Read this one. */
  combinado?: CrmTiempoEtapaCombinado;
}

/**
 * A closed monthly cohort as sent to the Results page — the same fields as
 * `CrmHistoricoRow`, but the endpoint guarantees every one of them.
 */
export type CrmCierre = Required<CrmHistoricoRow>;

export interface CrmEfectividadRow {
  etapa?: string;
  efectividad_pct?: number;
  exitosos?: number;
  fallidos?: number;
  total_salidas?: number;
}

/**
 * Metric block stored per dimension value. It is the same computation as a
 * monthly cierre row, run over the slice of opportunities belonging to one
 * branch / campaign / seller — so it carries the same measures, minus the
 * period itself.
 */
export type CrmMetricas = Omit<CrmHistoricoRow, 'periodo_reporte'>;

/** A row of `crm_dimensiones_historico`, as the analytics endpoint sends it. */
export interface CrmDimensionRow {
  periodo_reporte: string;
  dimension: string;
  valor: string;
  metricas: CrmMetricas;
  efectividad: CrmEfectividadRow[];
}

/**
 * One dimension value with its metrics hoisted to the top level — the shape the
 * charts and the detail table read, so neither has to reach through `metricas`.
 */
export type CrmDimensionValue = CrmMetricas & {
  valor: string;
  efectividad: CrmEfectividadRow[];
};

/** Payload of `GET /crm/api/dimension-metrics/`. */
export interface CrmDimensionsResponse {
  dimensiones: CrmDimensionRow[];
}
