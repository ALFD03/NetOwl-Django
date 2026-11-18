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
 * churn_detail.py`).
 */
export interface ChurnDetail {
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

export interface ChurnDetailResponse {
  status?: 'success' | 'empty' | 'error';
  period?: string;
  periods?: string[];
  total?: number;
  message?: string;
  bajas: ChurnDetail[];
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

/**
 * Una fila de la hoja de internet del formulario de la reguladora.
 *
 * `precio` viaja **en divisa, sin convertir**: la renta básica en bolívares es
 * ese precio por la tasa del BCV, y la tasa se aplica al exportar para que un
 * periodo ya calculado no quede congelado a la tasa de aquel día.
 */
export interface EtaFormularioInternet {
  nombre: string;
  tipo_suscriptor: string;
  /** Todas las entidades federales del catálogo, encadenadas. */
  entidades: string;
  suscriptores: number;
  precio: number;
  tipo_servicio: string;
  uplink_kbps: number;
  downlink_kbps: number;
  velocidad_promedio_kbps: number;
  consumo_promedio_mb: number;
}

export interface EtaFormularioTransporte {
  nombre: string;
  suscriptores: number;
  precio: number;
  velocidad_kbps: number;
}

export interface EtaFormularioTelevision {
  nombre: string;
  tipo_suscriptor: string;
  entidades: string;
  suscriptores: number;
  precio: number;
}

export interface EtaForms {
  internet: EtaFormularioInternet[];
  transporte: EtaFormularioTransporte[];
  television: EtaFormularioTelevision[];
  entidades: string;
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
  /**
   * Las tres hojas del libro que se declara.
   *
   * Ausente en los periodos bloqueados antes de que existieran: hay que
   * recalcular el periodo para que aparezcan.
   */
  formularios?: EtaForms;
  /** Planes que cuentan en las matrices pero no tienen plan regulador asignado. */
  planes_sin_regulador?: string[];
  /** Tasa del BCV fijada para el periodo. `0` = todavía sin fijar. */
  tasa_bcv?: number;
  /** De dónde salió: el día que publicó el BCV, o «Escrita a mano». */
  tasa_bcv_fuente?: string;
  /**
   * Por qué no hay tasa, cuando la consulta automática falló.
   *
   * No impide ver el reporte —las rentas salen vacías, como antes de que
   * hubiera consulta— pero hay que decirlo o parece que la tasa es cero.
   */
  tasa_bcv_aviso?: string;
  [key: string]: unknown;
}

export interface PeriodData {
  periodo_reporte: string;
  activos_inicio: number;
  activos_final: number;
  nuevos_mes: number;
  ingresos: number,
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

export interface ZoneData {
  valor: string;
  bajas: number;
  nuevos: number;
  activos_inicio: number;
  activos_final: number;
  churn_bruto_pct: number;
  crecimiento: number;
}

export interface SubscriptionDashboardProps {
  periodos: PeriodData[];
  dimensiones?: Record<string, ZoneData[]>;
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
  /**
   * La renta de este contrato, en divisa.
   *
   * El catálogo comercial no puede darla: cada enlace dedicado y cada
   * transporte negocia la suya, y es con lo que se declara su renta básica.
   * Las órdenes de la misma velocidad se declaran en una sola fila, con el
   * promedio de sus rentas.
   */
  precio?: number;
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
  promedio: number | null;
  mediana: number | null;
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
  tramo: string;
  desde: number;
  /** Null en el último tramo, que no tiene tope. */
  hasta: number | null;
  bajas: number;
  pct: number;
  pct_acumulado: number;
}

/** Un valor de una dimensión, con sus bajas que cuentan. */
export interface LifetimeDimensionRow {
  valor: string;
  bajas: number;
  promedio: number | null;
  mediana: number | null;
  p25: number | null;
  p75: number | null;
  /** % de esas bajas que se fue en sus primeros 30 / 90 días. */
  pct_30: number;
  pct_90: number;
}

export interface LifetimeMonth {
  mes: string;
  /** Hasta dónde llegan los logs (YYYY-MM-DD). */
  fecha_corte: string;
  /** El mes de la fecha de corte: sus bajas todavía pueden volver antes del cierre. */
  mes_en_curso: boolean;
  /** Las bajas que cuentan: instaladas desde `instaladas_desde` y fuera de las campañas excluidas. */
  bajas: number;
  /** Todas las bajas del mes, excluidas incluidas: es lo que cuadra con el cierre mensual. */
  bajas_mes: number;
  /** Cuántas bajas se quitaron de cada campaña excluida ("Sin campanna", "Exonerado"). */
  excluidas: Record<string, number>;
  /** Del resto, cuántas se instalaron antes de `instaladas_desde` y no se miden. */
  anteriores: number;
  /** Las bajas del cierre mensual guardado; si difiere de `bajas_mes`, uno de los dos se hizo con otros datos. */
  bajas_reporte: number | null;
  /** Fecha (YYYY-MM-DD) de instalación desde la que se miden las bajas. */
  instaladas_desde: string;
  resumen: LifetimeSummary;
  tramos: LifetimeTier[];
  por_dimension: Record<string, LifetimeDimensionRow[]>;
}

/** Una baja del mes, tal y como se exporta. */
export interface LifetimeChurn {
  orden: string;
  f_ini: string | null;
  f_baja: string | null;
  estado_cierre: string;
  dias_desde_instalacion: number | null;
  zona?: string;
  sucursal?: string;
  municipio?: string;
  campanna?: string;
  zona_sucursal?: string;
}

export interface LifetimeDetailResponse {
  period: string | null;
  bajas: LifetimeChurn[];
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
  desde: string | null;
  crecimiento: number | null;
  churn: number | null;
}

export interface TargetValues {
  crecimiento: number | null;
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
  cumpl_verde: number;
  cumpl_amarillo: number;
  /** Crecimiento (%), más es mejor: verde desde / amarillo desde. */
  crec_verde: number;
  crec_amarillo: number;
  /** Churn (%), menos es mejor: verde hasta / amarillo hasta. */
  churn_verde: number;
  churn_amarillo: number;
}

/** Lo que envía `get_objetivos_config()`. Las entidades van por nombre. */
export interface TargetsConfig {
  /** El objetivo general: uno solo, sin fecha. */
  general: { crecimiento: number; churn: number };
  /** Excepciones de un mes concreto, por `YYYY-MM`. Sustituyen al general. */
  meses: Record<string, TargetValues>;
  estados: Record<string, TargetTier[]>;
  sites: Record<string, TargetTier[]>;
  coordinadores: Record<string, TargetTier[]>;
  zonas: Record<string, TargetTier[]>;
  /** Por sucursal tal y como la trae el export (`NETCOM`, `NYC`...). */
  sucursales: Record<string, TargetTier[]>;
  /** Por nodo, con la clave de la dimensión `zona_sucursal`: `"Guacara - NYC"`. */
  zonas_sucursal: Record<string, TargetTier[]>;
  /**
   * Las zonas apartadas del cumplimiento, por nombre, con su tramo de meses
   * (ambos extremos incluidos; nulo es sin límite). Opcional: una página
   * servida antes de existir no lo trae.
   */
  zonas_sin_objetivo?: Record<string, { desde: string | null; hasta: string | null }>;
  semaforo: TargetsTrafficLight;
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
  /** % del precio que se lleva quien vende el plan, solo en los PYME. Nulo: sin definir. */
  comision_pyme_pct: number | null;
  /** Con qué fila del formulario se declara. `null` = todavía sin agrupar. */
  plan_regulador_id: number | null;
  plan_regulador: string;
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
  nombre: string;
  tecnologia: string;
  tipo_persona: string;
  datas_mbps: number;
  /** En divisa. La conversión a bolívares se hace al exportar. */
  precio: number;
  tiene_tv: boolean;
  /** Decide en qué hoja del libro cae la fila. */
  es_transporte: boolean;
  notas: string;
  /** Cuántos planes comerciales se declaran con él. */
  planes: number;
}

/** Una zona apartada del cumplimiento durante un tramo de meses (`ZonaSinObjetivo`). */
export interface CatalogZoneWithoutTarget {
  id: number;
  zona_id: number;
  zona: string;
  site: string;
  coordinador: string;
  /** `YYYY-MM`; vacío es desde siempre. */
  desde: string;
  /** `YYYY-MM`, incluido; vacío es sin fin. */
  hasta: string;
  nota: string;
  actualizado_por: string;
  actualizado_en: string;
}

export interface CatalogZone {
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

export interface CatalogSite {
  id: number;
  nombre: string;
  /** Orden de presentación comercial; lo consumen Sales Report y ETA. */
  orden: number;
  zonas: number;
  /** Las zonas del site y los equipos de ventas que lo trabajan. */
  zona_ids: number[];
  equipo_ids: number[];
  equipos: string[];
}

/** Estados y coordinadores: solo nombre y cuántas zonas dependen de ellos. */
export interface CatalogNamed {
  id: number;
  nombre: string;
  zonas: number;
}

/** Las áreas del módulo de Catálogos con una lista de pendientes propia. */
export type CatalogArea = 'productos' | 'estructura' | 'ventas';

/** Un nombre de los datos que se decidió no registrar en su área. */
export interface CatalogIgnoredProduct {
  id: number;
  nombre: string;
  area: CatalogArea;
  nota: string;
  creado_por: string;
  creado_en: string;
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
  nodo: string;
  zona: string;
  sucursal: string;
}

/** Un tramo de objetivo tal y como lo edita la pestaña de objetivos. */
export interface CatalogTarget {
  id: number;
  nivel: CatalogTargetLevel;
  /** La fila de zona, site, estado o coordinador (la zona de un nodo). Nulo en el general y la sucursal. */
  entidad_id: number | null;
  /** Nombre con el que se cruza: la sucursal tal cual, o `"Zona - Sucursal"` en un nodo. */
  entidad: string;
  /** En los niveles `sucursal` y `zona_sucursal`; vacío en el resto. */
  sucursal: string;
  /** `YYYY-MM`, o vacío si vale desde siempre. */
  desde: string;
  /** Nulo: esa métrica se hereda. */
  crecimiento_pct: number | null;
  churn_pct: number | null;
  nota: string;
  actualizado_por: string;
  actualizado_en: string;
}

/** La excepción de un mes concreto al objetivo general. */
export interface CatalogMonthTarget {
  id: number;
  periodo: string;
  crecimiento_pct: number | null;
  churn_pct: number | null;
  nota: string;
  actualizado_por: string;
  actualizado_en: string;
}

export interface CatalogTrafficLight extends TargetsTrafficLight {
  id: number;
}

/** Nombre ya importado que hoy no está en su catálogo (un producto, una zona…). */
export interface ProductoPendiente {
  nombre: string;
  ordenes: number;
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
export type SalesColumn = 'vendedor' | 'medio_supervisor' | 'medio';

/** Lo que un rol exige y admite en un equipo: la interfaz construye sus formularios con esto. */
export interface CatalogTeamRole {
  rol: SalesRole;
  etiqueta: string;
  /** `medio` se exige; `supervisor` (el literal de `Oportunidad/Administrador`) es opcional; `usuario` se exige. */
  medio: boolean;
  supervisor: boolean;
  usuario: boolean;
  /** Si lleva un site (coordinadora de oficina). */
  site: boolean;
  /** Cuántas unidades de negocio lleva: una (coordinador de UN), varias (jefe, gerentes) o ninguna. */
  unidades: '' | 'una' | 'varias';
  /** El rol al que responde, si es supervisor y su equipo tiene uno. */
  superior: SalesRole | null;
  /** Las piezas de pago que admite (`PIEZAS_POR_ROL`). */
  piezas: PaymentPiece[];
}

export interface CatalogSalesTeam {
  id: number;
  slug: string;
  nombre: string;
  roles: CatalogTeamRole[];
}

/** Una persona del directorio de ventas, tal y como la escribe Odoo, con sus papeles en los equipos. */
export interface CatalogSalesPerson {
  id: number;
  nombre: string;
  apellido: string;
  /** El literal de `Medio`. */
  medio: string;
  /**
   * El de `Oportunidad/Administrador`, cuando Odoo lo escribe distinto que en `Medio`.
   * Vacío: el mismo que `medio`.
   */
  medio_supervisor: string;
  /** El literal de `Vendedor`, con `(User)`. */
  usuario_odoo: string;
  /** Otros nombres con los que Odoo escribe a la misma persona, por columna (con otra tilde, por ejemplo). */
  alias_medio: string[];
  alias_supervisor: string[];
  alias_usuario: string[];
  membresias: { id: number; equipo: string; rol: SalesRole; etiqueta: string }[];
}

/** El papel de una persona en un equipo (`MembresiaEquipo`), con lo suyo ya resuelto. */
export interface CatalogMembership {
  id: number;
  persona_id: number;
  nombre: string;
  apellido: string;
  medio: string;
  medio_supervisor: string;
  usuario_odoo: string;
  alias_medio: string[];
  alias_supervisor: string[];
  alias_usuario: string[];
  equipo_id: number;
  /** El slug del equipo. */
  equipo: string;
  rol: SalesRole;
  /** Los sites de una coordinadora de oficina (uno o varios). */
  site_ids: number[];
  sites: string[];
  /** La membresía a la que responde un supervisor. */
  superior_id: number | null;
  superior: string;
  unidad_ids: number[];
  unidades: string[];
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
  tipo: 'monto' | 'pct_plan';
  valor: number;
}

export interface TeamPiece extends AmountPiece {
  alcance: TeamScope;
  excluir_oficina: boolean;
}

export interface PaymentTier {
  desde: number;
  monto: number;
  descontar?: number;
}

/** Los valores de pago de un rol: solo las piezas que su rol admite. */
export interface PaymentParameters {
  propia?: AmountPiece;
  equipo?: TeamPiece;
  factor?: ComplianceFactor;
  tramos_asesor?: PaymentTier[];
  bono_tramos?: PaymentTier[];
  bono_por_asesor?: PaymentTier[];
  bono_por_unidad?: { monto: number };
  escalon_crecimiento?: { umbral_pct: number; alto: number; bajo: number };
  bono_churn?: { max: number; monto: number }[];
  bono_empresa?: { monto: number; excedente: number };
}

/** Las condiciones de pago de un rol de un equipo: las que valen y si alguien las cambió. */
export interface CatalogRoleCondition {
  /** Nulo si nadie las editó (paga con las de por defecto). */
  id: number | null;
  equipo_id: number;
  equipo: string;
  rol: SalesRole;
  etiqueta: string;
  piezas: PaymentPiece[];
  parametros: PaymentParameters;
  defecto: PaymentParameters;
  personalizado: boolean;
}

/**
 * Un tramo del objetivo de ventas de las coordinadoras de oficina: cuántas
 * ventas al mes. Sin persona es el general; con persona, el suyo, que manda.
 */
export interface CatalogOfficeTarget {
  id: number;
  persona_id: number | null;
  persona: string;
  /** `YYYY-MM`; vacío es "desde siempre". */
  desde: string;
  ventas: number;
  nota: string;
  actualizado_por: string;
  actualizado_en: string;
}

/** Una unidad de negocio (el `Coordinador` de las zonas), sus equipos y quienes la llevan. */
export interface CatalogBusinessUnit extends CatalogNamed {
  zona_ids: number[];
  equipo_ids: number[];
  equipos: string[];
  responsables: { persona: string; rol: SalesRole; etiqueta: string; equipo: string }[];
}

/** Un nombre de las suscripciones que el directorio de ventas no reconoce. */
export interface PendingPerson {
  nombre: string;
  /** Órdenes por columna: no se suman, la venta directa de un supervisor está en dos. */
  ordenes: Partial<Record<SalesColumn, number>>;
  /** El rol que se sugiere según la columna en que aparece. */
  rol: SalesRole;
}

/** Qué grupos del módulo de Catálogos administra el usuario: uno por permiso. */
export interface CatalogsPermissions {
  operacional: boolean;
  comercial: boolean;
  ventas: boolean;
}

interface CatalogsPageProps {
  permisos: CatalogsPermissions;
}

/** `Catalogos/Notificaciones`: lo pendiente de cada área y lo ignorado. */
export interface CatalogsNotificationsProps extends CatalogsPageProps {
  /** `null` en las áreas que el usuario no administra; vacía es "todo registrado". */
  pendientes: {
    productos: ProductoPendiente[] | null;
    estructura: ProductoPendiente[] | null;
    ventas: PendingPerson[] | null;
  };
  ignorados: CatalogIgnoredProduct[];
  /** Las áreas cuyos ignorados puede ver y deshacer. */
  areas: CatalogOption[];
  /**
   * Lo que piden los formularios de alta, que se abren aquí mismo. Vacías las
   * listas de las áreas que el usuario no administra.
   */
  opciones: {
    reguladores: CatalogRegulatoryPlan[];
    tiposPersona: CatalogOption[];
    tecnologias: CatalogOption[];
    /** También con el permiso de ventas: el alta de una coordinadora de oficina pide su site. */
    sites: CatalogSite[];
    estados: CatalogNamed[];
    coordinadores: CatalogBusinessUnit[];
    equipos: CatalogSalesTeam[];
    membresias: CatalogMembership[];
    personas: CatalogSalesPerson[];
  };
}

/** `Catalogos/Productos`: planes y planes reguladores. */
export interface CatalogsProductsProps extends CatalogsPageProps {
  planes: CatalogPlan[];
  reguladores: CatalogRegulatoryPlan[];
  tecnologias: CatalogOption[];
  tiposPersona: CatalogOption[];
  /** `?nuevo_plan=` — abre el formulario de plan ya relleno con ese nombre. */
  nuevoPlan: string;
}

/** `Catalogos/Estructura`: zonas y estados. */
export interface CatalogsStructureProps extends CatalogsPageProps {
  zonas: CatalogZone[];
  /** Solo para elegir el de una zona: se administran en Ventas › Estructura de ventas. */
  sites: CatalogSite[];
  estados: CatalogNamed[];
  coordinadores: CatalogNamed[];
  tecnologias: CatalogOption[];
  /** `?nueva_zona=` — abre el formulario de zona ya relleno con ese nombre. */
  nuevaZona: string;
}

/** `Catalogos/Ventas`: la estructura de ventas, los equipos con su gente y condiciones, y los objetivos. */
export interface CatalogsSalesProps extends CatalogsPageProps {
  equipos: CatalogSalesTeam[];
  membresias: CatalogMembership[];
  personas: CatalogSalesPerson[];
  condiciones: CatalogRoleCondition[];
  /** `?nueva_persona=&equipo=&rol=` — abre el alta ya rellena con ese literal. */
  nuevaPersona: { literal: string; equipo: string; rol: string };
  coordinadores: CatalogBusinessUnit[];
  objetivos: CatalogTarget[];
  /** Los tramos del objetivo de ventas de las coordinadoras de oficina. */
  objetivosOficina: CatalogOfficeTarget[];
  zonasSinObjetivo: CatalogZoneWithoutTarget[];
  objetivos_mes: CatalogMonthTarget[];
  semaforo: CatalogTrafficLight;
  objetivosConfig: TargetsConfig;
  /** Los meses con cierre calculado (`YYYY-MM`), del más reciente al más antiguo. */
  periodosCalculados: string[];
  /** Los nodos de los datos: de donde se eligen la sucursal y el nodo de un objetivo. */
  nodosConocidos: KnownNode[];
  /** Las entidades a las que se les puede fijar un objetivo. */
  zonas: CatalogZone[];
  sites: CatalogSite[];
  estados: CatalogNamed[];
}
