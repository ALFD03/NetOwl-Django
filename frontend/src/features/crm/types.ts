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
