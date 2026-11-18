/**
 * Tipos de los props y respuestas del módulo de suscripciones.
 *
 * Viven en `shared` y no en el feature porque `shared/lib/api` tipa con ellos sus
 * respuestas y no puede depender de un feature; el feature los reexporta.
 */

export interface SubscriptionResultDimensionRow {
  value: string;
  active_start: number;
  active_end: number;
  new_subs: number;
  growth: number;
  churned: number;
  net_churn_pct: number;
  gross_churn_pct: number;
  unpaid_cuts: number;
  suspension_pct: number;
  total_inactive: number;
  reactivations: number;
  react_6_churn: number;
  react_8_30days: number;
  react_4_paused: number;
  react_4_P: number;
  react_4_H: number;
  winback_rate_pct: number;
  total_billing: number;
  arpu: number;
  react_val: number;
  react_contribution_pct: number;
  react_replacement_pct: number;
  net_adds: number;
  gross_adds: number;
  free_clients: number;
  free_new: number;
  free_returned: number;
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
 * churn_detail.py`).
 */
export interface ChurnDetail {
  order: string;
  client: string;
  id_number: string;
  sucursal: string;
  zona: string;
  campanna: string;
  producto: string;
  service_type: string;
  /** Número, para que la hoja lo pueda sumar; `null` cuando no hay dato. */
  subtotal: number | null;
  since_date: string;
  subscription_status: string;
  phone1: string;
  phone2: string;
}

export interface ChurnDetailResponse {
  status?: 'success' | 'empty' | 'error';
  period?: string;
  periods?: string[];
  total?: number;
  message?: string;
  churned: ChurnDetail[];
}

export type EtaStats = Record<string, number>;

export interface EtaMetrics {
  total?: number;
  by_technology?: EtaStats;
  by_person?: EtaStats;
  by_state?: EtaStats;
  by_technology_person?: EtaStats;
  by_state_technology?: EtaStats;
  by_state_person?: EtaStats;
  by_state_technology_person?: EtaStats;
  [key: string]: unknown;
}

/**
 * Una fila de la hoja de internet del formulario de la reguladora.
 *
 * `precio` viaja **en divisa, sin convertir**: la renta básica en bolívares es
 * ese precio por la tasa del BCV, y la tasa se aplica al exportar para que un
 * periodo ya calculado no quede congelado a la tasa de aquel día.
 */
export interface EtaInternetForm {
  name: string;
  subscriber_type: string;
  /** Todas las entidades federales del catálogo, encadenadas. */
  entities: string;
  subscribers: number;
  price: number;
  service_type: string;
  uplink_kbps: number;
  downlink_kbps: number;
  avg_speed_kbps: number;
  avg_usage_mb: number;
}

export interface EtaTransportForm {
  name: string;
  subscribers: number;
  price: number;
  speed_kbps: number;
}

export interface EtaTelevisionForm {
  name: string;
  subscriber_type: string;
  entities: string;
  subscribers: number;
  price: number;
}

export interface EtaForms {
  internet: EtaInternetForm[];
  transport: EtaTransportForm[];
  television: EtaTelevisionForm[];
  entities: string;
}

export interface SubscriptionEtaReportResponse {
  status?: string;
  period?: string;
  periods?: string[];
  is_locked?: boolean;
  individual_configs?: unknown[];
  net_metrics?: EtaMetrics;
  transport_metrics?: number;
  tv_metrics?: EtaMetrics;
  speed_metrics?: unknown;
  total_sampled?: number;
  unmapped_plans?: unknown[];
  unmapped_subs?: unknown[];
  /**
   * Las tres hojas del libro que se declara.
   *
   * Ausente en los periodos bloqueados antes de que existieran: hay que
   * recalcular el periodo para que aparezcan.
   */
  forms?: EtaForms;
  /** Planes que cuentan en las matrices pero no tienen plan regulador asignado. */
  plans_without_regulator?: string[];
  /** Tasa del BCV fijada para el periodo. `0` = todavía sin fijar. */
  bcv_rate?: number;
  /** De dónde salió: el día que publicó el BCV, o «Escrita a mano». */
  bcv_rate_source?: string;
  /**
   * Por qué no hay tasa, cuando la consulta automática falló.
   *
   * No impide ver el reporte —las rentas salen vacías, como antes de que
   * hubiera consulta— pero hay que decirlo o parece que la tasa es cero.
   */
  bcv_rate_warning?: string;
  [key: string]: unknown;
}

export interface PeriodData {
  report_period: string;
  active_start: number;
  active_end: number;
  new_in_month: number;
  inflows: number,
  churned: number;
  net_churn_pct: number;
  gross_churn_pct: number;
  react_4_P: number;
  react_val: number;
  winback_rate_pct: number;
  react_contribution_pct: number;
  react_replacement_pct: number;
  suspension_pct: number;
  arpu: number;
  unpaid_cuts: number;
  reactivations: number;
}

export interface ZoneData {
  value: string;
  churned: number;
  new_subs: number;
  active_start: number;
  active_end: number;
  gross_churn_pct: number;
  growth: number;
}

export interface SubscriptionDashboardProps {
  closings: PeriodData[];
  dimensions?: Record<string, ZoneData[]>;
}

export interface EtaSubscriptionConfig {
  order: string;
  client?: string;
  product?: string;
  technology?: string;
  person_type?: string;
  data_mbps?: number;
  has_tv?: boolean;
  report?: boolean;
  is_transport?: boolean;
  is_dedicated?: boolean;
  /**
   * La renta de este contrato, en divisa.
   *
   * El catálogo comercial no puede darla: cada enlace dedicado y cada
   * transporte negocia la suya, y es con lo que se declara su renta básica.
   * Las órdenes de la misma velocidad se declaran en una sola fila, con el
   * promedio de sus rentas.
   */
  price?: number;
}

export interface EtaPlanConfig {
  plan_name: string;
  name?: string;
  technology?: string;
  person_type?: string;
  data_mbps?: number;
  has_tv?: boolean;
  is_transport?: boolean;
  is_dedicated?: boolean;
  [key: string]: unknown;
}

export interface EtaDiscoveredSubscription extends EtaSubscriptionConfig {
  order: string;
  client?: string;
  product?: string;
  /** De dónde viene el contrato. Solo para localizarlo: no se declara. */
  sucursal?: string;
  zona?: string;
}

export interface SubscriptionEtaManagementProps {
  individualConfigs?: EtaSubscriptionConfig[];
  discoveredPlans?: string[];
  discoveredSubs?: EtaDiscoveredSubscription[];
  allKnownPlans?: EtaPlanConfig[];
  currentPeriod?: string;
}

// --- Lifetime: cuánto duraron activas las bajas de un mes -------------------
// Ver services/subscriptions/analytics/lifetime/. Una sola duración, de la
// instalación a la baja, y solo de las bajas instaladas desde `instaladas_desde`
// que no son de las campañas excluidas.

/** Estadísticos de una duración en días; null si no hay ninguna baja. */
export interface LifetimeSummary {
  n: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}

/**
 * Un tramo de duración (un mes de 30 días): cuántas bajas caen en él, su %
 * sobre las bajas que cuentan y el % acumulado hasta ese tramo.
 */
export interface LifetimeTier {
  bucket: string;
  since: number;
  /** Null en el último tramo, que no tiene tope. */
  until: number | null;
  churned: number;
  pct: number;
  cumulative_pct: number;
}

/** Un valor de una dimensión, con sus bajas que cuentan. */
export interface LifetimeDimensionRow {
  value: string;
  churned: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** % de esas bajas que se fue en sus primeros 30 / 90 días. */
  pct_30: number;
  pct_90: number;
}

export interface LifetimeMonth {
  churn_month: string;
  /** Hasta dónde llegan los logs (YYYY-MM-DD). */
  cutoff_date: string;
  /** El mes de la fecha de corte: sus bajas todavía pueden volver antes del cierre. */
  in_progress: boolean;
  /** Las bajas que cuentan: instaladas desde `instaladas_desde` y fuera de las campañas excluidas. */
  churned: number;
  /** Todas las bajas del mes, excluidas incluidas: es lo que cuadra con el cierre mensual. */
  churned_in_month: number;
  /** Cuántas bajas se quitaron de cada campaña excluida ("Sin campanna", "Exonerado"). */
  excluded: Record<string, number>;
  /** Del resto, cuántas se instalaron antes de `instaladas_desde` y no se miden. */
  earlier: number;
  /** Las bajas del cierre mensual guardado; si difiere de `bajas_mes`, uno de los dos se hizo con otros datos. */
  churned_reported: number | null;
  /** Fecha (YYYY-MM-DD) de instalación desde la que se miden las bajas. */
  installed_since: string;
  summary: LifetimeSummary;
  buckets: LifetimeTier[];
  by_dimension: Record<string, LifetimeDimensionRow[]>;
}

/** Una baja del mes, tal y como se exporta. */
export interface LifetimeChurn {
  order: string;
  start_date: string | null;
  churn_date: string | null;
  close_status: string;
  days_since_install: number | null;
  zona?: string;
  sucursal?: string;
  municipio?: string;
  campanna?: string;
  zona_sucursal?: string;
}

export interface LifetimeDetailResponse {
  period: string | null;
  churned: LifetimeChurn[];
}

// --- Catálogos de referencia -------------------------------------------------
// Planes, zonas, sites, estados y coordinadores. Antes eran `Planes.json` y
// `Zonas.json`; hoy son tablas que se editan en el módulo de Catálogos (`/catalogos/`).

// --- Objetivos comerciales (ver features/subscriptions/lib/targets.ts) ---

/**
 * Un tramo con vigencia: vale desde `desde` (`YYYY-MM`, nulo = siempre) hasta
 * que empieza el siguiente. Un valor nulo no fija esa métrica.
 */
export interface TargetTier {
  since: string | null;
  growth: number | null;
  churn: number | null;
}

export interface TargetValues {
  growth: number | null;
  churn: number | null;
}

/**
 * Umbrales de color: valores directos en %, iguales para todo el módulo.
 *
 * No dependen del objetivo: el mismo churn se pinta igual en cualquier zona y
 * en cualquier página. El cumplimiento ya es un % de la meta.
 */
export interface TargetsTrafficLight {
  /** Cumplimiento (% de la meta): verde desde / amarillo desde. */
  compliance_green: number;
  compliance_yellow: number;
  /** Crecimiento (%), más es mejor: verde desde / amarillo desde. */
  growth_green: number;
  growth_yellow: number;
  /** Churn (%), menos es mejor: verde hasta / amarillo hasta. */
  churn_green: number;
  churn_yellow: number;
}

/** Lo que envía `get_objetivos_config()`. Las entidades van por nombre. */
export interface TargetsConfig {
  /** El objetivo general: uno solo, sin fecha. */
  general: { growth: number; churn: number };
  /** Excepciones de un mes concreto, por `YYYY-MM`. Sustituyen al general. */
  months: Record<string, TargetValues>;
  states: Record<string, TargetTier[]>;
  sites: Record<string, TargetTier[]>;
  coordinators: Record<string, TargetTier[]>;
  zones: Record<string, TargetTier[]>;
  /** Por sucursal tal y como la trae el export (`NETCOM`, `NYC`...). */
  branches: Record<string, TargetTier[]>;
  /** Por nodo, con la clave de la dimensión `zona_sucursal`: `"Guacara - NYC"`. */
  zone_branches: Record<string, TargetTier[]>;
  /**
   * Las zonas apartadas del cumplimiento, por nombre, con su tramo de meses
   * (ambos extremos incluidos; nulo es sin límite). Opcional: una página
   * servida antes de existir no lo trae.
   */
  zones_without_target?: Record<string, { since: string | null; until: string | null }>;
  thresholds: TargetsTrafficLight;
}

export type CatalogKind =
  | 'personas'
  | 'membresias'
  | 'condiciones_equipo'
  | 'objetivos_oficina'
  | 'zonas_sin_objetivo'
  | 'planes'
  | 'zonas'
  | 'sites'
  | 'estados'
  | 'coordinadores'
  | 'ignorados'
  | 'reguladores'
  | 'objetivos'
  | 'objetivos_mes'
  | 'semaforo';

export interface CatalogOption {
  value: string;
  label: string;
}

export interface CatalogPlan {
  id: number;
  name: string;
  /** Cuadro tarifario. Distingue dos filas con el mismo nombre de plan. */
  tariff: string;
  technology: string;
  person_type: string;
  reference: string;
  has_tv: boolean;
  data_mbps: number;
  price: number;
  /** Si el plan se declara a la reguladora en el reporte ETA. */
  declare_in_eta: boolean;
  /** % del precio que se lleva quien vende el plan, solo en los PYME. Nulo: sin definir. */
  sme_commission_pct: number | null;
  /** Con qué fila del formulario se declara. `null` = todavía sin agrupar. */
  regulator_plan_id: number | null;
  regulator_plan: string;
}

/**
 * El plan tal y como se **declara**, no como se vende.
 *
 * Varios planes comerciales colapsan en uno: la misma velocidad con dos
 * tarifas es un solo producto ante la reguladora. Lleva sus propios campos
 * porque, cuando dos planes del grupo difieren en precio o velocidad, lo
 * declarado tiene que ser una decisión explícita.
 */
export interface CatalogRegulatoryPlan {
  id: number;
  name: string;
  technology: string;
  person_type: string;
  data_mbps: number;
  /** En divisa. La conversión a bolívares se hace al exportar. */
  price: number;
  has_tv: boolean;
  /** Decide en qué hoja del libro cae la fila. */
  is_transport: boolean;
  notes: string;
  /** Cuántos planes comerciales se declaran con él. */
  plans: number;
}

/** Una zona apartada del cumplimiento durante un tramo de meses (`ZonaSinObjetivo`). */
export interface CatalogZoneWithoutTarget {
  id: number;
  zone_id: number;
  zona: string;
  site: string;
  coordinator: string;
  /** `YYYY-MM`; vacío es desde siempre. */
  since: string;
  /** `YYYY-MM`, incluido; vacío es sin fin. */
  until: string;
  note: string;
  updated_by: string;
  updated_at: string;
}

export interface CatalogZone {
  id: number;
  name: string;
  site_id: number;
  site: string;
  state_id: number;
  state: string;
  technology: string;
  coordinator_id: number | null;
  coordinator: string;
}

export interface CatalogSite {
  id: number;
  name: string;
  /** Orden de presentación comercial; lo consumen Sales Report y ETA. */
  order: number;
  zones: number;
  /** Las zonas del site y los equipos de ventas que lo trabajan. */
  zone_ids: number[];
  team_ids: number[];
  teams: string[];
}

/** Estados y coordinadores: solo nombre y cuántas zonas dependen de ellos. */
export interface CatalogNamed {
  id: number;
  name: string;
  zones: number;
}

/** Las áreas del módulo de Catálogos con una lista de pendientes propia. */
export type CatalogArea = 'productos' | 'estructura' | 'ventas';

/** Un nombre de los datos que se decidió no registrar en su área. */
export interface CatalogIgnoredProduct {
  id: number;
  name: string;
  area: CatalogArea;
  note: string;
  created_by: string;
  created_at: string;
}

/** Nivel de un objetivo, de más alto a más bajo (el general es el respaldo). */
export type CatalogTargetLevel =
  | 'general'
  | 'sucursal'
  | 'estado'
  | 'site'
  | 'coordinador'
  | 'zona'
  | 'zona_sucursal';

/** Un nodo (zona - sucursal) que aparece en algún cierre calculado. */
export interface KnownNode {
  /** `"Guacara - NYC"`. */
  node: string;
  zona: string;
  sucursal: string;
}

/** Un tramo de objetivo tal y como lo edita la pestaña de objetivos. */
export interface CatalogTarget {
  id: number;
  level: CatalogTargetLevel;
  /** La fila de zona, site, estado o coordinador (la zona de un nodo). Nulo en el general y la sucursal. */
  entity_id: number | null;
  /** Nombre con el que se cruza: la sucursal tal cual, o `"Zona - Sucursal"` en un nodo. */
  entity: string;
  /** En los niveles `sucursal` y `zona_sucursal`; vacío en el resto. */
  sucursal: string;
  /** `YYYY-MM`, o vacío si vale desde siempre. */
  since: string;
  /** Nulo: esa métrica se hereda. */
  growth_pct: number | null;
  churn_pct: number | null;
  note: string;
  updated_by: string;
  updated_at: string;
}

/** La excepción de un mes concreto al objetivo general. */
export interface CatalogMonthTarget {
  id: number;
  period: string;
  growth_pct: number | null;
  churn_pct: number | null;
  note: string;
  updated_by: string;
  updated_at: string;
}

export interface CatalogTrafficLight extends TargetsTrafficLight {
  id: number;
}

/** Nombre ya importado que hoy no está en su catálogo (un producto, una zona…). */
export interface PendingProduct {
  name: string;
  orders: number;
}

/** El rol de una persona en un equipo de ventas (`services/catalogs/teams.py`). */
export type SalesRole =
  | 'jefe'
  | 'jefe_un'
  | 'coord_un'
  | 'gerente_un'
  | 'gerente_ops'
  | 'coord_oficina'
  | 'supervisor'
  | 'asesor'
  | 'administradora'
  | 'telemarketing';

/** Las columnas del export que nombran a una persona de ventas. */
export type SalesColumn = 'seller' | 'supervisor_channel' | 'channel';

/** Lo que un rol exige y admite en un equipo: la interfaz construye sus formularios con esto. */
export interface CatalogTeamRole {
  role: SalesRole;
  role_label: string;
  /** `medio` se exige; `supervisor` (el literal de `Oportunidad/Administrador`) es opcional; `usuario` se exige. */
  channel: boolean;
  supervisor: boolean;
  user: boolean;
  /** Si lleva un site (coordinadora de oficina). */
  site: boolean;
  /** Cuántas unidades de negocio lleva: una (coordinador de UN), varias (jefe, gerentes) o ninguna. */
  units: '' | 'una' | 'varias';
  /** El rol al que responde, si es supervisor y su equipo tiene uno. */
  manager: SalesRole | null;
  /** Las piezas de pago que admite (`PIEZAS_POR_ROL`). */
  pieces: PaymentPiece[];
}

export interface CatalogSalesTeam {
  id: number;
  slug: string;
  name: string;
  roles: CatalogTeamRole[];
}

/** Una persona del directorio de ventas, tal y como la escribe Odoo, con sus papeles en los equipos. */
export interface CatalogSalesPerson {
  id: number;
  name: string;
  last_name: string;
  /** El literal de `Medio`. */
  channel: string;
  /**
   * El de `Oportunidad/Administrador`, cuando Odoo lo escribe distinto que en `Medio`.
   * Vacío: el mismo que `medio`.
   */
  supervisor_channel: string;
  /** El literal de `Vendedor`, con `(User)`. */
  odoo_user: string;
  /** Otros nombres con los que Odoo escribe a la misma persona, por columna (con otra tilde, por ejemplo). */
  channel_alias: string[];
  supervisor_alias: string[];
  user_alias: string[];
  memberships: { id: number; equipo: string; role: SalesRole; role_label: string }[];
}

/** El papel de una persona en un equipo (`MembresiaEquipo`), con lo suyo ya resuelto. */
export interface CatalogMembership {
  id: number;
  person_id: number;
  name: string;
  last_name: string;
  channel: string;
  supervisor_channel: string;
  odoo_user: string;
  channel_alias: string[];
  supervisor_alias: string[];
  user_alias: string[];
  team_id: number;
  /** El slug del equipo. */
  equipo: string;
  role: SalesRole;
  /** Los sites de una coordinadora de oficina (uno o varios). */
  site_ids: number[];
  sites: string[];
  /** La membresía a la que responde un supervisor. */
  manager_id: number | null;
  manager: string;
  unit_ids: number[];
  units: string[];
}

export type TeamScope = 'supervisados' | 'equipo_completo' | 'unidades' | 'oficina';
export type ComplianceFactor = 'ninguno' | 'site' | 'unidad';

export type PaymentPiece =
  | 'propia'
  | 'equipo'
  | 'factor'
  | 'tramos_asesor'
  | 'bono_tramos'
  | 'bono_por_asesor'
  | 'bono_por_unidad'
  | 'escalon_crecimiento'
  | 'bono_churn'
  | 'bono_empresa';

export interface AmountPiece {
  /** `monto`: dólares por venta; `pct_plan`: un % del precio del plan. */
  kind: 'monto' | 'pct_plan';
  value: number;
}

export interface TeamPiece extends AmountPiece {
  scope: TeamScope;
  exclude_office: boolean;
}

export interface PaymentTier {
  since: number;
  amount: number;
  deduct?: number;
}

/** Los valores de pago de un rol: solo las piezas que su rol admite. */
export interface PaymentParameters {
  propia?: AmountPiece;
  equipo?: TeamPiece;
  factor?: ComplianceFactor;
  tramos_asesor?: PaymentTier[];
  bono_tramos?: PaymentTier[];
  bono_por_asesor?: PaymentTier[];
  bono_por_unidad?: { amount: number };
  escalon_crecimiento?: { threshold_pct: number; high: number; low: number };
  bono_churn?: { max: number; amount: number }[];
  bono_empresa?: { amount: number; surplus: number };
}

/** Las condiciones de pago de un rol de un equipo: las que valen y si alguien las cambió. */
export interface CatalogRoleCondition {
  /** Nulo si nadie las editó (paga con las de por defecto). */
  id: number | null;
  team_id: number;
  equipo: string;
  role: SalesRole;
  role_label: string;
  pieces: PaymentPiece[];
  params: PaymentParameters;
  policy: PaymentParameters;
  custom: boolean;
}

/**
 * Un tramo del objetivo de ventas de las coordinadoras de oficina: cuántas
 * ventas al mes. Sin persona es el general; con persona, el suyo, que manda.
 */
export interface CatalogOfficeTarget {
  id: number;
  person_id: number | null;
  person: string;
  /** `YYYY-MM`; vacío es "desde siempre". */
  since: string;
  ventas: number;
  note: string;
  updated_by: string;
  updated_at: string;
}

/** Una unidad de negocio (el `Coordinador` de las zonas), sus equipos y quienes la llevan. */
export interface CatalogBusinessUnit extends CatalogNamed {
  zone_ids: number[];
  team_ids: number[];
  teams: string[];
  owners: { person: string; role: SalesRole; role_label: string; equipo: string }[];
}

/** Un nombre de las suscripciones que el directorio de ventas no reconoce. */
export interface PendingPerson {
  name: string;
  /** Órdenes por columna: no se suman, la venta directa de un supervisor está en dos. */
  orders: Partial<Record<SalesColumn, number>>;
  /** El rol que se sugiere según la columna en que aparece. */
  role: SalesRole;
}

/** Qué grupos del módulo de Catálogos administra el usuario: uno por permiso. */
export interface CatalogsPermissions {
  operacional: boolean;
  comercial: boolean;
  ventas: boolean;
}

interface CatalogsPageProps {
  permissions: CatalogsPermissions;
}

/** `Catalogos/Notificaciones`: lo pendiente de cada área y lo ignorado. */
export interface CatalogsNotificationsProps extends CatalogsPageProps {
  /** `null` en las áreas que el usuario no administra; vacía es "todo registrado". */
  pending: {
    productos: PendingProduct[] | null;
    estructura: PendingProduct[] | null;
    ventas: PendingPerson[] | null;
  };
  ignored: CatalogIgnoredProduct[];
  /** Las áreas cuyos ignorados puede ver y deshacer. */
  areas: CatalogOption[];
  /**
   * Lo que piden los formularios de alta, que se abren aquí mismo. Vacías las
   * listas de las áreas que el usuario no administra.
   */
  options: {
    regulators: CatalogRegulatoryPlan[];
    personTypes: CatalogOption[];
    technologies: CatalogOption[];
    /** También con el permiso de ventas: el alta de una coordinadora de oficina pide su site. */
    sites: CatalogSite[];
    states: CatalogNamed[];
    coordinators: CatalogBusinessUnit[];
    teams: CatalogSalesTeam[];
    memberships: CatalogMembership[];
    people: CatalogSalesPerson[];
  };
}

/** `Catalogos/Productos`: planes y planes reguladores. */
export interface CatalogsProductsProps extends CatalogsPageProps {
  plans: CatalogPlan[];
  regulators: CatalogRegulatoryPlan[];
  technologies: CatalogOption[];
  personTypes: CatalogOption[];
  /** `?new_plan=` — abre el formulario de plan ya relleno con ese nombre. */
  newPlan: string;
}

/** `Catalogos/Estructura`: zonas y estados. */
export interface CatalogsStructureProps extends CatalogsPageProps {
  zones: CatalogZone[];
  /** Solo para elegir el de una zona: se administran en Ventas › Estructura de ventas. */
  sites: CatalogSite[];
  states: CatalogNamed[];
  coordinators: CatalogNamed[];
  technologies: CatalogOption[];
  /** `?new_zone=` — abre el formulario de zona ya relleno con ese nombre. */
  newZone: string;
}

/** `Catalogos/Ventas`: la estructura de ventas, los equipos con su gente y condiciones, y los objetivos. */
export interface CatalogsSalesProps extends CatalogsPageProps {
  teams: CatalogSalesTeam[];
  memberships: CatalogMembership[];
  people: CatalogSalesPerson[];
  conditions: CatalogRoleCondition[];
  /** `?new_person=&team=&role=` — abre el alta ya rellena con ese literal. */
  newPerson: { literal: string; equipo: string; role: string };
  coordinators: CatalogBusinessUnit[];
  targets: CatalogTarget[];
  /** Los tramos del objetivo de ventas de las coordinadoras de oficina. */
  officeTargets: CatalogOfficeTarget[];
  zonesWithoutTarget: CatalogZoneWithoutTarget[];
  monthly_targets: CatalogMonthTarget[];
  thresholds: CatalogTrafficLight;
  targetsConfig: TargetsConfig;
  /** Los meses con cierre calculado (`YYYY-MM`), del más reciente al más antiguo. */
  computedPeriods: string[];
  /** Los nodos de los datos: de donde se eligen la sucursal y el nodo de un objetivo. */
  knownNodes: KnownNode[];
  /** Las entidades a las que se les puede fijar un objetivo. */
  zones: CatalogZone[];
  sites: CatalogSite[];
  states: CatalogNamed[];
}
