/**
 * Tipos de los props y respuestas del módulo de suscripciones.
 *
 * Viven en `shared` y no en el feature porque `shared/lib/api` tipa con ellos sus
 * respuestas y no puede depender de un feature; el feature los reexporta.
 */

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
  clientes_gratuitos: number;
  gratuitos_nuevos: number;
  gratuitos_retornados: number;
  cumplimiento_ingresos: number;
  cumplimiento_ventas: number;
  cumplimiento_cierre: number;
}

export interface SubscriptionResultsResponse {
  dimensions: Record<string, SubscriptionResultDimensionRow[]>;
}

/**
 * Una baja del periodo con la ficha de su cliente.
 *
 * La ficha es la que la suscripción tiene **hoy**, no la que tenía el mes en
 * que se dio de baja: las tablas de origen se truncan en cada importación (el
 * mismo aviso que el reporte ETA lleva en `services/subscriptions/analytics/
 * bajas_detalle.py`).
 */
export interface BajaDetalle {
  orden: string;
  cliente: string;
  cedula: string;
  sucursal: string;
  zona: string;
  campanna: string;
  producto: string;
  tipo_servicio: string;
  /** Número, para que la hoja lo pueda sumar; `null` cuando no hay dato. */
  subtotal: number | null;
  fecha_inicio: string;
  estado_suscripcion: string;
  phone1: string;
  phone2: string;
}

export interface BajasDetalleResponse {
  status?: 'success' | 'empty' | 'error';
  period?: string;
  periods?: string[];
  total?: number;
  message?: string;
  bajas: BajaDetalle[];
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

// --- Catálogos de referencia -------------------------------------------------
// Planes, zonas, sites, estados y coordinadores. Antes eran `Planes.json` y
// `Zonas.json`; hoy son tablas que se editan en `/subscriptions/config/`.

export type CatalogoTipo =
  | 'planes'
  | 'zonas'
  | 'sites'
  | 'estados'
  | 'coordinadores'
  | 'ignorados';

export interface CatalogoOption {
  value: string;
  label: string;
}

export interface CatalogoPlan {
  id: number;
  nombre: string;
  /** Cuadro tarifario. Distingue dos filas con el mismo nombre de plan. */
  tarifa: string;
  tecnologia: string;
  tipo_persona: string;
  referencia: string;
  tiene_tv: boolean;
  datas_mbps: number;
  precio: number;
  /** Si el plan se declara a la reguladora en el reporte ETA. */
  declarar_en_eta: boolean;
}

export interface CatalogoZona {
  id: number;
  nombre: string;
  site_id: number;
  site: string;
  estado_id: number;
  estado: string;
  tecnologia: string;
  coordinador_id: number | null;
  coordinador: string;
}

export interface CatalogoSite {
  id: number;
  nombre: string;
  /** Orden de presentación comercial; lo consumen Sales Report y ETA. */
  orden: number;
  zonas: number;
}

/** Estados y coordinadores: solo nombre y cuántas zonas dependen de ellos. */
export interface CatalogoNombrado {
  id: number;
  nombre: string;
  zonas: number;
}

export interface CatalogoProductoIgnorado {
  id: number;
  nombre: string;
  nota: string;
  creado_por: string;
  creado_en: string;
}

/** Producto ya importado que hoy no está en el catálogo. */
export interface ProductoPendiente {
  nombre: string;
  ordenes: number;
}

export interface SubscriptionCatalogosProps {
  planes: CatalogoPlan[];
  zonas: CatalogoZona[];
  sites: CatalogoSite[];
  estados: CatalogoNombrado[];
  coordinadores: CatalogoNombrado[];
  ignorados: CatalogoProductoIgnorado[];
  pendientes: ProductoPendiente[];
  tecnologias: CatalogoOption[];
  tiposPersona: CatalogoOption[];
  /** `?nuevo_plan=` — abre el formulario de plan ya relleno con ese nombre. */
  nuevoPlan: string;
}
