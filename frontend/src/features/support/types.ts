/** Tipos del feature de soporte: medidas de tiempo, tasas y bloques de métricas. */

import type { MetricColor } from '@/shared/ui';
import type { DayCuts, DaySeries } from '@/shared/types/domain';

/**
 * The eight time measures, mirroring `TIME_MEASURE_SPECS` in
 * `backend/support/config.py`.
 *
 * There is no population selector: each measure carries the only population it
 * makes sense over. The two closure clocks are measured on what CLOSED in the
 * period — `cierre_creado_*` is Odoo's own `duracion_total_horas`, the whole
 * process with the queue included, and `cierre_asignado_*` only the
 * technician's handling. `asignacion` is measured on what was RAISED in the
 * period and requires no outcome: a ticket still waiting for an assignee is
 * measured against the cut itself (end of day on the day bar, end of month on
 * the month), because the wait is happening — leaving it out emptied the
 * measure of exactly the tickets it exists to surface. The cut is the end of
 * the period and not the time of the run, so a closed month always reports the
 * same figures however often it is re-analysed.
 *
 * `escalamiento` is creation → escalation, on what ATC escalated in the period
 * (from the stage logs); it is empty for every other group.
 *
 * Nothing is dropped for being short: only a missing or out-of-order date
 * keeps a ticket out. `muestra_<measure>` is the coverage, and on the closing
 * clocks its distance from `tickets_cerrados` is the count of tickets closed
 * without ever having been assigned.
 */
export const SUPPORT_TIME_MEASURES = [
  'close_created_resolved',
  'close_created_cancelled',
  'close_created_closed',
  'close_assigned_resolved',
  'close_assigned_cancelled',
  'close_assigned_closed',
  'assignment',
  'escalation',
] as const;

export type SupportTimeMeasure = (typeof SUPPORT_TIME_MEASURES)[number];

/**
 * The nine scalar columns `_prefixed()` emits per measure. Spelling them out
 * once as a template literal keeps the sixty-three columns the backend stores
 * from having to be re-typed by hand in every interface below.
 */
type SupportTimeStatKey<M extends string> =
  | `time_${'mean' | 'median' | 'min' | 'p25' | 'p75' | 'max' | 'std'}_${M}_hours`
  | `pct_over_avg_${M}`
  | `sample_${M}`;

/** Every time column, optional — what the backend may or may not have stored. */
export type SupportTimeMetrics = { [K in SupportTimeStatKey<SupportTimeMeasure>]?: number };

/** Every time column, resolved to a number — what the views render. */
export type SupportTimeStats = { [K in SupportTimeStatKey<SupportTimeMeasure>]: number };

/**
 * Volumes and rates, mirroring `SUPPORT_VOLUME_FIELDS` / `SUPPORT_RATE_FIELDS`.
 *
 * Two denominators, each fixed to the rate that needs it:
 *
 * - `pct_resueltos` and `pct_cancelados` are read over `tickets_cerrados` — the
 *   outcome mix of the work despatched this month. Each splits into the part
 *   that was also raised this month (`_periodo`) and the part carried over from
 *   earlier ones (`_arrastre`); both share the denominator, so the two addends
 *   close exactly on the total.
 * - `pct_rezagados` is read over `tickets_creados`: of the demand that came in,
 *   how much did not close inside its own month.
 */
export interface SupportRateMetrics {
  /** The period's cohort: raised in it or closed in it. Used for weighting. */
  total_tickets?: number;
  tickets_created?: number;
  tickets_closed?: number;
  tickets_resolved?: number;
  tickets_resolved_in_period?: number;
  tickets_resolved_carryover?: number;
  tickets_cancelled?: number;
  tickets_cancelled_in_period?: number;
  tickets_cancelled_carryover?: number;
  /**
   * Lo que ATC cerró escalándolo a Soporte. Para ATC escalar es cerrar: cuenta
   * en `tickets_cerrados` y no en resueltos ni cancelados, así que resueltos +
   * cancelados + escalados = cerrados. En Soporte es 0.
   */
  tickets_escalated?: number;
  tickets_escalated_in_period?: number;
  tickets_escalated_carryover?: number;
  /** De lo creado en el mes, lo que llegó escalado de ATC (sólo Soporte). */
  tickets_received_escalated?: number;
  tickets_lagging?: number;

  pct_resolved?: number;
  pct_resolved_in_period?: number;
  pct_resolved_carryover?: number;
  pct_cancelled?: number;
  pct_cancelled_in_period?: number;
  pct_cancelled_carryover?: number;
  pct_escalated?: number;
  pct_escalated_in_period?: number;
  pct_escalated_carryover?: number;
  /** Sobre lo creado, no sobre lo cerrado. */
  pct_received_escalated?: number;
  pct_lagging?: number;

  /**
   * En qué se va el tiempo: horas medias en cola, pausa, gestión y etapas sin
   * clasificar de lo cerrado en el mes, contando sólo las del equipo del grupo.
   * Son promedios para que las cuatro partes sumen el tiempo medio.
   */
  queue_hours?: number;
  pause_hours?: number;
  handling_hours?: number;
  unclassified_hours?: number;
  /** Los cerrados con logs de etapa: sin logs no hay reparto. */
  composition_sample?: number;
}

/** One `compute_metrics_for_period` block, as the backend serialises it. */
export interface SupportMetrics extends SupportTimeMetrics, SupportRateMetrics {
  /** Only on cross-period averages: how many periods went into the mean. */
  evaluated_periods?: number;
}

/** The same block with every optional resolved, ready to render. */
export type SupportStats = SupportTimeStats & Required<SupportRateMetrics>;

/** One period of `support_cierre_historico`, flattened by the query layer. */
export interface SupportHistoricoRow extends SupportMetrics {
  report_period: string;
}

/** A distribution of hours, resolved from one `_compute_stats_for_series` block. */
export interface SupportTimeDistribution {
  promedio: number;
  median: number;
  min: number;
  p25: number;
  p75: number;
  max: number;
  std: number;
  pctExcedeProm: number;
  /** Tickets that could actually be measured; 0 means there is nothing to draw. */
  sample: number;
}

// --- Dashboard --------------------------------------------------------------

export interface SupportDashboardProps {
  metrics?: {
    evaluated_periods?: number;
    global_summary?: SupportMetrics;
    by_work_group?: Record<string, SupportMetrics>;
    trend_history?: SupportHistoricoRow[];
  };
  /** Los tickets abiertos ahora; `null` sin el permiso o sin logs analizados. */
  open?: OpenTickets | null;
}

/** A clickable sparkline: the cross-period average plus its per-period series. */
export interface SupportTrendCard {
  id: string;
  title: string;
  value: string;
  color: MetricColor;
  labels: string[];
  values: number[];
  unitLabel: string;
  /** Series shown on the card. */
  rateKey: keyof SupportHistoricoRow;
  /** Absolute-volume series shown in the drill-down modal. */
  countKey: keyof SupportHistoricoRow;
  /** Volume figures are counts; time figures are hours. */
  unit: 'tickets' | 'horas';
}

/** One work group, ranked by its share of the monthly ticket volume. */
export interface SupportGroupCard {
  id: string;
  label: string;
  color: MetricColor;
  totalTickets: number;
  sharePct: number;
  pctResolved: number;
  pctCancelled: number;
  pctRezagados: number;
  /** Sólo el grupo que escala (ATC) lo tiene distinto de cero. */
  pctEscalated: number;
  /** Mean hours from creation to closure, over resolved and cancelled alike. */
  mttr: number;
  mttrMediana: number;
  /** Green when the group closes faster than the global mean, red when slower. */
  mttrColor: MetricColor;
  /** Signed gap against the global MTTR, in hours. */
  mttrDelta: number;
  /** Mean hours spent queued before the first assignment. */
  espera: number;
  pctExcedeProm: number;
}

// --- Analytics --------------------------------------------------------------

/**
 * The four first-level axes inside a work group.
 *
 * `asignado_a` and `creado_por` are two different people and must stay apart:
 * Odoo's creator is whoever opened the ticket, the assignee whoever answers
 * for it, and they are almost never the same. Reading tickets raised off the
 * assignee axis credited the opening to the technician who later handled it.
 */
export const SUPPORT_DIMENSIONS = ['zona', 'sucursal', 'asignado_a', 'creado_por'] as const;
export type SupportDimension = (typeof SUPPORT_DIMENSIONS)[number];

/**
 * Los dos ejes cuyo valor es una persona, espejo de `SUPPORT_PERSON_DIMENSIONS`
 * en `services/support/analytics/config.py`. Son los únicos que el servidor
 * anota con un departamento.
 */
export const SUPPORT_PERSON_DIMENSIONS = ['asignado_a', 'creado_por'] as const;

export type SupportPersonDimension = (typeof SUPPORT_PERSON_DIMENSIONS)[number];

/** Si ese eje lleva departamento, estrechando el tipo al comprobarlo. */
export function isPersonDimension(
  dimension: SupportDimension,
): dimension is SupportPersonDimension {
  return (SUPPORT_PERSON_DIMENSIONS as readonly string[]).includes(dimension);
}

/** The three ways a dimension value is broken down. */
export const SUPPORT_DESGLOSES = ['tipo_solicitud', 'razon_falla', 'solucion_falla'] as const;
export type SupportDesglose = (typeof SUPPORT_DESGLOSES)[number];

/** One value of any axis — a zone, a technician, a failure reason. */
export interface SupportDimensionEntry {
  name: string;
  metrics?: SupportMetrics;
  /**
   * Departamento de esa persona, sólo en los ejes `asignado_a` y `creado_por`.
   *
   * Lo resuelve el servidor **al leer** contra el directorio de
   * `/support/users/` (`anotar_departamentos`), no al calcular: así corregir a
   * quién pertenece alguien se ve en todos los meses sin reanalizar. Cadena
   * vacía = no está en el directorio.
   */
  department?: string;
}

/** One work group with its own block and every axis already grouped. */
export type SupportGroup = { metrics?: SupportMetrics } & Partial<
  Record<SupportDimension | SupportDesglose, SupportDimensionEntry[]>
>;

/**
 * Ticket load of a zone against its active subscribers, for one work group.
 *
 * The numerator is scoped to the group; `total_suscriptores` is not, because
 * subscribers are never split by support group — so a row reads "this group's
 * tickets per 100 customers of the zone", and the groups' rates add up to the
 * zone's total rate.
 */
export interface SupportZoneEntry {
  zona: string;
  site: string;
  technology?: string;
  total_tickets?: number;
  total_subscribers?: number;
  incidence_rate_pct?: number;
  mttr_avg?: number;
  pct_resolved?: number;
}

export interface SupportAnalyticsProps {
  analyticsData?: {
    period?: string;
    groups?: Record<string, SupportGroup>;
    /** Keyed by work group; the selector picks one client-side. */
    zone_incidence?: Record<string, SupportZoneEntry[]>;
  };
  /**
   * Which days of the month have a cut computed, and which one is on screen,
   * plus the light per-day series. The dimensional breakdown arrives inside
   * `analyticsData`; `useDayPayload` serves the other days from its cache.
   */
  dayMetrics?: SupportDayCuts;
  periods?: string[];
  selectedPeriod?: string;
}

/**
 * La barra de días de soporte, con la serie ligera abierta por grupo de trabajo.
 *
 * `serie` es el total del mes y `serie_grupos` lo mismo por equipo. Existen las
 * dos porque la página entera está filtrada por grupo —el selector no tiene un
 * «todos»—, así que unas tarjetas con el total de la empresa dirían otra cosa
 * que el resto de la pantalla.
 */
export interface SupportDayCuts extends DayCuts {
  /** `{ día: { grupo: métricas } }`. Ausente en meses analizados antes. */
  group_series?: Record<string, Record<string, DaySeries[string]>>;
}

/** El corte completo de un día, tal y como lo sirve `/api/support/day-metrics/`. */
export interface SupportDayPayload {
  groups: Record<string, SupportGroup>;
  zone_incidence: Record<string, SupportZoneEntry[]>;
}

/** One entry of the group selector, ordered by volume. */
export interface SupportGroupOption {
  key: string;
  label: string;
  totalTickets: number;
}

/** A dimension or breakdown value flattened so tables read a single level. */
export interface SupportDimensionRow extends SupportMetrics {
  name: string;
  /** Share of the parent's ticket volume. */
  pctOfParent: number;
  /** Vacío salvo en los dos ejes de persona; ver `SupportDimensionEntry`. */
  department: string;
}

/**
 * Las personas de un eje sumadas por departamento.
 *
 * Se calcula en el cliente sobre las filas que ya están en pantalla: dentro de
 * un grupo de trabajo, cada ticket tiene un solo asignado y un solo creador, así
 * que las personas parten el conjunto y los volúmenes se suman sin contar nada
 * dos veces. Las tasas se recalculan desde esas sumas y los tiempos medios son
 * la media ponderada por su muestra, que es exactamente la media del conjunto.
 *
 * Lo que **no** se puede reconstruir desde los bloques ya calculados son las
 * medianas, los percentiles, la desviación y el `pct_over_avg`: hacen
 * falta los tickets uno a uno. Salen en cero y la tabla de departamentos no los
 * enseña, en vez de inventar un promedio de medianas.
 */
export interface SupportDepartmentRow extends SupportDimensionRow {
  /** Cuántas personas del eje caen en este departamento. */
  personas: number;
}

/** A zone ranked by how many tickets each 100 of its active subscribers raise. */
export interface SupportZoneRow {
  zona: string;
  site: string;
  technology: string;
  totalTickets: number;
  totalSuscriptores: number;
  incidenceRate: number;
  mttrAverage: number;
  pctResolved: number;
  /** No active subscribers on record — the incidence rate is not computable. */
  withoutPopulation: boolean;
}

/** What `GET /support/api/breakdown/` returns for one dimension value. */
export interface SupportBreakdownResponse {
  period?: string;
  grupo_trabajo?: string;
  dimension?: string;
  value?: string;
  metrics?: SupportMetrics;
  breakdowns?: Partial<Record<SupportDesglose, SupportDimensionEntry[]>>;
}

// --- Results ----------------------------------------------------------------

export interface SupportResultsProps {
  history?: SupportHistoricoRow[];
  /** El detalle del mes elegido: el mismo bloque que Analytics lee para el cierre. */
  analyticsData?: SupportAnalyticsProps['analyticsData'];
  periods?: string[];
  selectedPeriod?: string;
}

// --- Directorio de usuarios -------------------------------------------------
//
// Quién puede crear o tener asignado un ticket. `nombre_odoo` es la clave real:
// el literal con el que la persona sale en las columnas `Asignado a` y
// `Creado por` del export, sufijo `(User)` incluido.

export interface SupportUser {
  id: number;
  odoo_name: string;
  name: string;
  last_name: string;
  full_name: string;
  /** El departamento vigente: la última fila de `historial`. */
  department_id: number;
  department: string;
  /** `YYYY-MM-DD`. Nula en quien se registró antes de que existiera el campo. */
  start_date: string | null;
  /** `YYYY-MM-DD`. Con fecha, el usuario está dado de baja pero no borrado. */
  end_date: string | null;
  active: boolean;
  /** Los departamentos por los que ha pasado, del ingreso a hoy. */
  timeline: DepartmentStep[];
}

/** Un tramo de la historia: «a partir de `desde`, en `departamento`». */
export interface DepartmentStep {
  id: number;
  department_id: number;
  department: string;
  /** Nula en el tramo inicial: significa «desde el ingreso». */
  since: string | null;
}

/** Un usuario dado de baja a cuyo nombre siguen entrando tickets. */
export interface UserAfterChurn {
  id: number;
  odoo_name: string;
  end_date: string;
  /** Tickets creados después de la baja que lo tienen asignado. */
  assigned: number;
  /** Tickets creados después de la baja que figuran como creados por él. */
  created: number;
  /** El día del ticket más reciente. */
  last: string;
}

export interface SupportDepartment {
  id: number;
  name: string;
  /** Cuánta gente lo referencia: un departamento con usuarios no se borra. */
  users: number;
}

/** Un nombre que ya firma o atiende tickets y que el directorio no reconoce. */
export interface PendingUser {
  /** Ya normalizado, con el sufijo puesto: es lo que se guardaría. */
  odoo_name: string;
  /** Tal y como lo escribe el export, por si difiere del normalizado. */
  literal: string;
  assigned: number;
  created: number;
}

export interface SupportUsersProps {
  users: SupportUser[];
  departments: SupportDepartment[];
  pending: PendingUser[];
  afterChurn: UserAfterChurn[];
  /** El sufijo que el servidor añade solo; se enseña como pista en el formulario. */
  suffix: string;
  /** Nombre que llega en `?new_user=`: abre el alta ya rellena. */
  newUser: string;
}

// --- Logs de etapa: abiertos y catálogo de etapas --------------------------

/** Equipo de un tramo: el de su etapa, o el del momento si es compartida. */
export type FlowTeam = 'atc' | 'soporte';
/** Qué se hace en una etapa. `cierre` y `sin_clasificar` no se editan en el catálogo. */
export type StageKind = 'cola' | 'pausa' | 'gestion' | 'cierre' | 'sin_clasificar';

/** Los estadísticos de una serie de horas (los mismos de las demás medidas de soporte). */
export interface HourStats {
  mean: number;
  median: number;
  min: number;
  p25: number;
  p75: number;
  max: number;
  std: number;
  pct_over_avg: number;
  sample: number;
}

/** Un grupo de tickets abiertos (por etapa, grupo, asignado…). */
export interface OpenGroup {
  current_stage?: string;
  current_team?: FlowTeam;
  current_type?: StageKind;
  grupo_trabajo?: string;
  asignado_a?: string;
  tipo_solicitud?: string;
  zona?: string;
  open: number;
  age_mean: number | null;
  age_median: number | null;
  age_max: number | null;
  in_stage_mean: number | null;
  in_stage_median: number | null;
  escalated: number;
}

export interface OpenTicket {
  ticket: string;
  stage: string;
  team: FlowTeam;
  type: StageKind;
  grupo_trabajo: string;
  asignado_a: string;
  tipo_solicitud: string;
  zona: string;
  opened_at: string | null;
  is_escalated: boolean;
  age_h: number | null;
  in_stage_h: number | null;
}

export interface OpenTickets {
  now: string;
  logs_until: string | null;
  summary: {
    open: number;
    escalated: number;
    in_atc: number;
    in_support: number;
    age: HourStats;
    in_stage: HourStats;
    in_support_since_escalation: HourStats;
    /** Abiertos según los logs pero cerrados en el export de tickets: les faltan logs. */
    stale: number;
  };
  aging: { bucket: string; open: number; pct: number }[];
  by_stage: OpenGroup[];
  by_group: OpenGroup[];
  by_assignee: OpenGroup[];
  by_request_type: OpenGroup[];
  by_zone: OpenGroup[];
  items: OpenTicket[];
  items_limit: number;
}

/** Una etapa del catálogo. */
export interface SupportStage {
  id: number;
  name: string;
  team: FlowTeam | 'compartida';
  type: 'cola' | 'pausa' | 'gestion';
  /** Logs que entran en ella. */
  logs: number;
  is_escalation: boolean;
}

/** Una etapa que aparece en los logs y que el catálogo no clasifica. */
export interface PendingStage {
  stage: string;
  logs: number;
  tickets: number;
  last: string | null;
}

export interface CatalogChoice {
  value: string;
  label: string;
}

export interface SupportStagesProps {
  stages: SupportStage[];
  pending: PendingStage[];
  teams: CatalogChoice[];
  types: CatalogChoice[];
  escalationStage: string;
  closeStages: string[];
  /** Nombre que llega en `?new_stage=`: abre el alta ya rellena. */
  newStage: string;
}
