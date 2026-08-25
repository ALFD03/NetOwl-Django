import type { MetricColor } from '@/shared/ui';

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
  pct_excede_med_inst?: number;
  horas_promedio_perd?: number;
  horas_mediana_perd?: number;
  horas_p25_perd?: number;
  horas_p75_perd?: number;
  horas_min_perd?: number;
  horas_max_perd?: number;
  horas_std_perd?: number;
  pct_excede_prom_perd?: number;
  pct_excede_med_perd?: number;
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

export interface CrmDashboardProps {
  metrics?: {
    historico_tendencias?: CrmHistoricoRow[];
    efectividad?: CrmEfectividadRow[];
  };
  periods?: string[];
}

export interface CrmGlobalStats {
  total_oportunidades: number;
  pct_instalacion: number;
  pct_perdida: number;
  pct_pendientes: number;
  pct_devueltos_e8: number;
  horas_promedio_inst: number;
  horas_mediana_inst: number;
  horas_p25_inst: number;
  horas_p75_inst: number;
  horas_min_inst: number;
  horas_max_inst: number;
  horas_std_inst: number;
  pct_excede_prom_inst: number;
  pct_excede_med_inst: number;
  horas_promedio_perd: number;
  horas_mediana_perd: number;
  horas_p25_perd: number;
  horas_p75_perd: number;
  horas_min_perd: number;
  horas_max_perd: number;
  horas_std_perd: number;
  pct_excede_prom_perd: number;
  pct_excede_med_perd: number;
}

export interface CrmTrendCard {
  id: string;
  title: string;
  value: string;
  color: MetricColor;
  labels: string[];
  values: number[];
  unitLabel: string;
  rateKey: keyof CrmHistoricoRow;
  countKey: keyof CrmHistoricoRow;
}

export interface CrmHealthCard {
  id: string;
  label: string;
  pct: number;
  color: MetricColor;
  successCount: number;
  successPct: number;
  failCount: number;
  failPct: number;
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

export interface CrmAnalyticsProps {
  /** Every dimension of the selected period; the dimension filter is client-side. */
  dimensionsData?: CrmDimensionRow[];
  /** The cierre row of the selected period: global denominators and header stats. */
  globalData?: CrmHistoricoRow;
  periods?: string[];
  selectedPeriod?: string;
}

/** A single "who leads this measure" readout in the ranking section. */
export interface CrmRankingEntry {
  id: string;
  label: string;
  /** Winning dimension value, or `—` when the period has no data. */
  valor: string;
  value: string;
  caption: string;
  color: MetricColor;
}
