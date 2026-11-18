/** Tipos transversales del dominio: periodos, dimensiones y métricas diarias. */

export interface DimensionVal {
  value: string;
  active_start?: number;
  active_end?: number;
  new_subs?: number;
  churned?: number;
  growth?: number;
  net_churn_pct?: number;
  gross_churn_pct?: number;
  unpaid_cuts?: number;
  suspension_pct?: number;
  net_adds?: number;
  gross_adds?: number;
  reactivations?: number;
  react_val?: number;
  winback_rate_pct?: number;
  react_4_P?: number;
  react_contribution_pct?: number;
  react_replacement_pct?: number;
  arpu?: number;
  total_billing?: number;
  free_clients?: number;
  free_new?: number;
  free_returned?: number;
}

/** Metricas de un dia: globales del mes hasta ese corte + desglose por nodo. */
export interface DayPayload {
  global: Period;
  /** Desglose plano por `zona_sucursal` (Ventas y Unidades de Negocio). */
  dimensions: DimensionVal[];
  /**
   * Desgloses del selector de Analytics agrupados por dimension.
   * Opcional: los dias calculados antes de guardarlos no lo traen.
   */
  dims?: Record<string, DimensionVal[]>;
}

/**
 * La serie ligera de un mes: el bloque global de cada dia, indexado por dia.
 *
 * Cada entrada es el corte ACUMULADO del mes hasta ese dia, sin desgloses
 * dimensionales. Lo de un dia suelto se obtiene restando el dia calculado
 * anterior (`shared/lib/daySeries`).
 */
export type DaySeries = Record<string, Record<string, number>>;

/**
 * La barra de dias de un modulo que pide el desglose al servidor (CRM, Soporte).
 *
 * `series` trae el mes entero pero solo en su parte ligera, que es lo que hace
 * que mover la barra sea instantaneo: tarjetas, acumulados, variacion contra el
 * dia anterior y lineas de tendencia salen de ahi sin pedir nada. El desglose
 * dimensional del dia elegido llega en las props normales de la pagina, y los
 * demas dias los pide y cachea `useDayPayload`.
 */
export interface DayCuts {
  month: string;
  available_days: number[];
  /** Dia que resolvio el servidor; 0 cuando el mes no tiene cortes. */
  day: number;
  series?: DaySeries;
}

/** Fila de analyzer_day_metrics: un mes completo, indexado por dia. */
export interface DayMetrics {
  report_period: string;
  month: string;
  active_start: number;
  days: Record<string, DayPayload>;
}

export interface DimensionGroup {
  report_period: string;
  dimensions: Record<string, DimensionVal[]>;
}

export interface Period {
  report_period: string;
  active_start?: number;
  active_end?: number;
  gross_adds?: number;
  net_adds?: number;
  growth?: number;
  reactivations?: number;
  react_val?: number;
  winback_rate_pct?: number;
  react_replacement_pct?: number;
  arpu?: number;
  total_billing?: number;
  new_in_month?: number;
  inflows?: number,
  net_churn_pct?: number;
  gross_churn_pct?: number;
  unpaid_cuts?: number;
  churned?: number;
  react_4_P?: number;
  suspension_pct?: number;
  react_contribution_pct?: number;
  free_clients?: number;
  free_new?: number;
  free_returned?: number;
}

