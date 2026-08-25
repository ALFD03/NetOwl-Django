export type ThemeColor = 'green' | 'red' | 'blue' | 'yellow' | 'slate' | 'brand' | 'emerald';

export interface SelectedTrend {
  title: string;
  rateKey: string;
  countKey: string;
  unitLabel: string;
  color: string;
  bgColor: string;
  theme?: ThemeColor;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status?: string;
  message?: string;
}

export interface DimensionVal {
  valor: string;
  activos_inicio?: number;
  activos_final?: number;
  nuevos?: number;
  bajas?: number;
  crecimiento?: number;
  churn_neto_pct?: number;
  churn_bruto_pct?: number;
  corte_impagado?: number;
  porcentaje_suspensiones?: number;
  adiciones_netas?: number;
  adiciones_brutas?: number;
  reactivaciones?: number;
  react_val?: number;
  tasa_winback_pct?: number;
  react_4_P?: number;
  tasa_aporte_react_pct?: number;
  indice_reemplazo_react_pct?: number;
  arpu?: number;
  total_billing?: number;
}

export interface DimensionGroup {
  periodo_reporte: string;
  dimensiones: Record<string, DimensionVal[]>;
}

export interface Periodo {
  periodo_reporte: string;
  activos_inicio?: number;
  activos_final?: number;
  adiciones_brutas?: number;
  adiciones_netas?: number;
  crecimiento?: number;
  reactivaciones?: number;
  react_val?: number;
  tasa_winback_pct?: number;
  indice_reemplazo_react_pct?: number;
  arpu?: number;
  total_billing?: number;
  nuevos_mes?: number;
  churn_neto_pct?: number;
  churn_bruto_pct?: number;
  corte_impagado?: number;
  bajas?: number;
  react_4_P?: number;
  porcentaje_suspensiones?: number;
  tasa_aporte_react_pct?: number;
}

export interface MetricsHistoricItem {
  periodo_reporte: string;
  [key: string]: string | number | undefined;
}
