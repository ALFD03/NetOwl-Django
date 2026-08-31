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
  clientes_gratuitos?: number;
  gratuitos_nuevos?: number;
  gratuitos_retornados?: number;
}

/** Metricas de un dia: globales del mes hasta ese corte + desglose por nodo. */
export interface DayPayload {
  global: Periodo;
  dimensiones: DimensionVal[];
}

/** Fila de analyzer_day_metrics: un mes completo, indexado por dia. */
export interface DayMetrics {
  periodo_reporte: string;
  periodo_mes: string;
  activos_inicio: number;
  dias: Record<string, DayPayload>;
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
  clientes_gratuitos?: number;
  gratuitos_nuevos?: number;
  gratuitos_retornados?: number;
}

export interface MetricsHistoricItem {
  periodo_reporte: string;
  [key: string]: string | number | undefined;
}
