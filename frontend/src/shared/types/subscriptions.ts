export interface SubscriptionResultDimensionRow {
  valor: string;
  activos_inicio: number;
  activos_final: number;
  nuevos: number;
  crecimiento: number;
  bajas: number;
  churn_neto_pct: number;
  churn_bruto_pct: number;
  corte_impagado: number;
  porcentaje_suspensiones: number;
  total_inactivos: number;
  reactivaciones: number;
  react_6_churn: number;
  react_8_30days: number;
  react_4_paused: number;
  react_4_P: number;
  react_4_H: number;
  tasa_winback_pct: number;
  total_billing: number;
  arpu: number;
  react_val: number;
  tasa_aporte_react_pct: number;
  indice_reemplazo_react_pct: number;
  adiciones_netas: number;
  adiciones_brutas: number;
}

export interface SubscriptionResultsResponse {
  dimensions: Record<string, SubscriptionResultDimensionRow[]>;
}

export type EtaStats = Record<string, number>;

export interface EtaMetrics {
  total?: number;
  por_tecnologia?: EtaStats;
  por_persona?: EtaStats;
  por_estado?: EtaStats;
  por_tecnologia_persona?: EtaStats;
  por_estado_tecnologia?: EtaStats;
  por_estado_persona?: EtaStats;
  por_estado_tecnologia_persona?: EtaStats;
  [key: string]: unknown;
}

export interface SubscriptionEtaReportResponse {
  status?: string;
  periodo?: string;
  periods?: string[];
  esta_bloqueado?: boolean;
  individual_configs?: unknown[];
  net_metrics?: EtaMetrics;
  transporte_metrics?: number;
  tv_metrics?: EtaMetrics;
  speed_metrics?: unknown;
  total_muestreado?: number;
  unmapped_plans?: unknown[];
  unmapped_subs?: unknown[];
  [key: string]: unknown;
}

export interface PeriodoData {
  periodo_reporte: string;
  activos_inicio: number;
  activos_final: number;
  nuevos_mes: number;
  bajas: number;
  churn_neto_pct: number;
  churn_bruto_pct: number;
  react_4_P: number;
  react_val: number;
  tasa_winback_pct: number;
  tasa_aporte_react_pct: number;
  indice_reemplazo_react_pct: number;
  porcentaje_suspensiones: number;
  arpu: number;
  corte_impagado: number;
  reactivaciones: number;
}

export interface ZonaData {
  valor: string;
  bajas: number;
  nuevos: number;
  activos_inicio: number;
  activos_final: number;
  churn_bruto_pct: number;
  crecimiento: number;
}

export interface SubscriptionDashboardProps {
  periodos: PeriodoData[];
  dimensiones?: Record<string, ZonaData[]>;
}

export interface EtaSubscriptionConfig {
  orden: string;
  cliente?: string;
  producto?: string;
  tecnologia?: string;
  tipo_persona?: string;
  datas_mbps?: number;
  tiene_tv?: boolean;
  reportar?: boolean;
  es_transporte?: boolean;
  es_dedicado?: boolean;
}

export interface EtaPlanConfig {
  plan_name: string;
  name?: string;
  tecnologia?: string;
  tipo_persona?: string;
  datas_mbps?: number;
  tiene_tv?: boolean;
  es_transporte?: boolean;
  es_dedicado?: boolean;
  [key: string]: unknown;
}

export interface EtaDiscoveredSubscription extends EtaSubscriptionConfig {
  orden: string;
  cliente?: string;
  producto?: string;
}

export interface SubscriptionEtaManagementProps {
  individualConfigs?: EtaSubscriptionConfig[];
  planesConfigs?: EtaPlanConfig[];
  discoveredPlans?: string[];
  discoveredSubs?: EtaDiscoveredSubscription[];
  allKnownPlans?: EtaPlanConfig[];
  currentPeriod?: string;
}

// Lifetime / Survival analysis types
export interface CurvaPoint {
  tiempo: number;
  sup: number;
}

export interface LifetimeData {
  mediana_activo?: number;
  p25_activo?: number;
  p75_activo?: number;
  n_total_activo?: number;
  total_suscriptores?: number;
  n_censurado_activo?: number;
  curva_activo?: CurvaPoint[];
  mediana_reactivacion?: number;
  [key: string]: unknown;
}

export interface LifetimeDimensionInfo {
  n_total_activo?: number;
  mediana_activo?: number;
  p25_activo?: number;
  p75_activo?: number;
  mediana_reactivacion?: number;
  curva_activo?: CurvaPoint[];
  [key: string]: unknown;
}
