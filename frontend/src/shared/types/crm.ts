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
  /** Per-stage effectiveness of the period, stored as JSONB on the cierre row. */
  efectividad?: CrmEfectividadRow[];
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
