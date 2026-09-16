/** Tipos transversales del dominio: periodos, dimensiones y métricas diarias. */

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
  /** Desglose plano por `zona_sucursal` (Ventas y Unidades de Negocio). */
  dimensiones: DimensionVal[];
  /**
   * Desgloses del selector de Analytics agrupados por dimension.
   * Opcional: los dias calculados antes de guardarlos no lo traen.
   */
  dims?: Record<string, DimensionVal[]>;
}

/**
 * La barra de dias de un modulo que pide el corte al servidor (CRM, Soporte).
 *
 * No trae los datos de ningun dia: solo cuales hay calculados y cual se esta
 * mirando. El corte en si llega en las props normales de la pagina, ya sustituido
 * por la vista.
 */
export interface DayCuts {
  periodo_mes: string;
  dias_disponibles: number[];
  /** Dia que resolvio el servidor; 0 cuando el mes no tiene cortes. */
  dia: number;
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
