/** Tipos del feature de soporte: medidas de tiempo, tasas y bloques de métricas. */

import type { MetricColor } from '@/shared/ui';
import type { DayCuts, DaySeries } from '@/shared/types/domain';

export interface SupportAnalysisRequest { month: string | null; }
export interface SupportAnalysisResponse { message: string; log_output?: string; }

/**
 * The seven time measures, mirroring `TIME_MEASURE_SPECS` in
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
 * Nothing is dropped for being short: only a missing or out-of-order date
 * keeps a ticket out. `muestra_<measure>` is the coverage, and on the closing
 * clocks its distance from `tickets_cerrados` is the count of tickets closed
 * without ever having been assigned.
 */
export const SUPPORT_TIME_MEASURES = [
  'cierre_creado_resuelto',
  'cierre_creado_cancelado',
  'cierre_creado_cerrados',
  'cierre_asignado_resuelto',
  'cierre_asignado_cancelado',
  'cierre_asignado_cerrados',
  'asignacion',
] as const;

export type SupportTimeMeasure = (typeof SUPPORT_TIME_MEASURES)[number];

/**
 * The nine scalar columns `_prefixed()` emits per measure. Spelling them out
 * once as a template literal keeps the sixty-three columns the backend stores
 * from having to be re-typed by hand in every interface below.
 */
type SupportTimeStatKey<M extends string> =
  | `tiempo_${'medio' | 'mediana' | 'min' | 'p25' | 'p75' | 'max' | 'std'}_${M}_horas`
  | `pct_excede_promedio_${M}`
  | `muestra_${M}`;

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
  tickets_creados?: number;
  tickets_cerrados?: number;
  tickets_resueltos?: number;
  tickets_resueltos_periodo?: number;
  tickets_resueltos_arrastre?: number;
  tickets_cancelados?: number;
  tickets_cancelados_periodo?: number;
  tickets_cancelados_arrastre?: number;
  tickets_rezagados?: number;

  pct_resueltos?: number;
  pct_resueltos_periodo?: number;
  pct_resueltos_arrastre?: number;
  pct_cancelados?: number;
  pct_cancelados_periodo?: number;
  pct_cancelados_arrastre?: number;
  pct_rezagados?: number;
}

/** One `compute_metrics_for_period` block, as the backend serialises it. */
export interface SupportMetrics extends SupportTimeMetrics, SupportRateMetrics {
  /** Only on cross-period averages: how many periods went into the mean. */
  periodos_evaluados?: number;
}

/** The same block with every optional resolved, ready to render. */
export type SupportStats = SupportTimeStats & Required<SupportRateMetrics>;

/** One period of `support_cierre_historico`, flattened by the query layer. */
export interface SupportHistoricoRow extends SupportMetrics {
  periodo_reporte: string;
}

/** A distribution of hours, resolved from one `_compute_stats_for_series` block. */
export interface SupportTimeDistribution {
  promedio: number;
  mediana: number;
  min: number;
  p25: number;
  p75: number;
  max: number;
  std: number;
  pctExcedeProm: number;
  /** Tickets that could actually be measured; 0 means there is nothing to draw. */
  muestra: number;
}

// --- Dashboard --------------------------------------------------------------

export interface SupportDashboardProps {
  metrics?: {
    periodos_evaluados?: number;
    resumen_global?: SupportMetrics;
    por_grupo_trabajo?: Record<string, SupportMetrics>;
    historico_tendencias?: SupportHistoricoRow[];
  };
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
  pctResueltos: number;
  pctCancelados: number;
  pctRezagados: number;
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
 * Los dos ejes cuyo valor es una persona, espejo de `SUPPORT_DIMENSIONES_PERSONA`
 * en `services/support/analytics/config.py`. Son los únicos que el servidor
 * anota con un departamento.
 */
export const SUPPORT_DIMENSIONES_PERSONA = ['asignado_a', 'creado_por'] as const;

export type SupportDimensionPersona = (typeof SUPPORT_DIMENSIONES_PERSONA)[number];

/** Si ese eje lleva departamento, estrechando el tipo al comprobarlo. */
export function esDimensionPersona(
  dimension: SupportDimension,
): dimension is SupportDimensionPersona {
  return (SUPPORT_DIMENSIONES_PERSONA as readonly string[]).includes(dimension);
}

/** The three ways a dimension value is broken down. */
export const SUPPORT_DESGLOSES = ['tipo_solicitud', 'razon_falla', 'solucion_falla'] as const;
export type SupportDesglose = (typeof SUPPORT_DESGLOSES)[number];

/** One value of any axis — a zone, a technician, a failure reason. */
export interface SupportDimensionEntry {
  nombre: string;
  metricas?: SupportMetrics;
  /**
   * Departamento de esa persona, sólo en los ejes `asignado_a` y `creado_por`.
   *
   * Lo resuelve el servidor **al leer** contra el directorio de
   * `/support/users/` (`anotar_departamentos`), no al calcular: así corregir a
   * quién pertenece alguien se ve en todos los meses sin reanalizar. Cadena
   * vacía = no está en el directorio.
   */
  departamento?: string;
}

/** One work group with its own block and every axis already grouped. */
export type SupportGroup = { metricas?: SupportMetrics } & Partial<
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
  tecnologia?: string;
  total_tickets?: number;
  total_suscriptores?: number;
  tasa_incidencia_pct?: number;
  mttr_promedio?: number;
  pct_resueltos?: number;
}

export interface SupportAnalyticsProps {
  analyticsData?: {
    periodo?: string;
    grupos?: Record<string, SupportGroup>;
    /** Keyed by work group; the selector picks one client-side. */
    incidencia_zonas?: Record<string, SupportZoneEntry[]>;
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
  serie_grupos?: Record<string, Record<string, DaySeries[string]>>;
}

/** El corte completo de un día, tal y como lo sirve `/support/api/day-metrics/`. */
export interface SupportDayPayload {
  grupos: Record<string, SupportGroup>;
  incidencia_zonas: Record<string, SupportZoneEntry[]>;
}

/** One entry of the group selector, ordered by volume. */
export interface SupportGroupOption {
  key: string;
  label: string;
  totalTickets: number;
}

/** A dimension or breakdown value flattened so tables read a single level. */
export interface SupportDimensionRow extends SupportMetrics {
  nombre: string;
  /** Share of the parent's ticket volume. */
  pctDelPadre: number;
  /** Vacío salvo en los dos ejes de persona; ver `SupportDimensionEntry`. */
  departamento: string;
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
 * medianas, los percentiles, la desviación y el `pct_excede_promedio`: hacen
 * falta los tickets uno a uno. Salen en cero y la tabla de departamentos no los
 * enseña, en vez de inventar un promedio de medianas.
 */
export interface SupportDepartamentoRow extends SupportDimensionRow {
  /** Cuántas personas del eje caen en este departamento. */
  personas: number;
}

/** A zone ranked by how many tickets each 100 of its active subscribers raise. */
export interface SupportZoneRow {
  zona: string;
  site: string;
  tecnologia: string;
  totalTickets: number;
  totalSuscriptores: number;
  tasaIncidencia: number;
  mttrPromedio: number;
  pctResueltos: number;
  /** No active subscribers on record — the incidence rate is not computable. */
  sinPoblacion: boolean;
}

/** What `GET /support/api/breakdown/` returns for one dimension value. */
export interface SupportBreakdownResponse {
  periodo?: string;
  grupo_trabajo?: string;
  dimension?: string;
  valor?: string;
  metricas?: SupportMetrics;
  desgloses?: Partial<Record<SupportDesglose, SupportDimensionEntry[]>>;
}

// --- Results ----------------------------------------------------------------

export interface SupportResultsProps {
  historico?: SupportHistoricoRow[];
}

// --- Directorio de usuarios -------------------------------------------------
//
// Quién puede crear o tener asignado un ticket. `nombre_odoo` es la clave real:
// el literal con el que la persona sale en las columnas `Asignado a` y
// `Creado por` del export, sufijo `(User)` incluido.

export interface UsuarioSoporte {
  id: number;
  nombre_odoo: string;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  departamento_id: number;
  departamento: string;
}

export interface DepartamentoSoporte {
  id: number;
  nombre: string;
  /** Cuánta gente lo referencia: un departamento con usuarios no se borra. */
  usuarios: number;
}

/** Un nombre que ya firma o atiende tickets y que el directorio no reconoce. */
export interface UsuarioPendiente {
  /** Ya normalizado, con el sufijo puesto: es lo que se guardaría. */
  nombre_odoo: string;
  /** Tal y como lo escribe el export, por si difiere del normalizado. */
  literal: string;
  asignados: number;
  creados: number;
}

export interface SupportUsersProps {
  usuarios: UsuarioSoporte[];
  departamentos: DepartamentoSoporte[];
  pendientes: UsuarioPendiente[];
  /** El sufijo que el servidor añade solo; se enseña como pista en el formulario. */
  sufijo: string;
  /** Nombre que llega en `?nuevo_usuario=`: abre el alta ya rellena. */
  nuevoUsuario: string;
}
