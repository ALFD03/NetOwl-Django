import type { MetricColor } from '@/shared/ui';

export interface SupportAnalysisRequest { month: string | null; }
export interface SupportAnalysisResponse { message: string; log_output?: string; }

/**
 * Headline ticket metrics averaged across every analysed period.
 *
 * Mirrors `resumen_global_avg` in `backend/support/analyzer.py`, which is the
 * mean of each field over all closed periods.
 */
export interface SupportGlobalSummary {
  total_tickets_promedio_mensual?: number;
  tickets_resueltos_promedio_mensual?: number;
  tickets_cancelados_promedio_mensual?: number;
  tickets_rezagados_promedio_mensual?: number;
  pct_resueltos?: number;
  pct_cancelados?: number;
  pct_rezagados?: number;
  tiempo_medio_cierre_horas?: number;
  tiempo_mediana_cierre_horas?: number;
  tiempo_promedio_primera_respuesta_horas?: number;
  pct_excede_promedio_cierre?: number;
  pct_excede_mediana_cierre?: number;
}

/** One closed monthly period, as stored in `support_cierre_historico`. */
export interface SupportHistoricoRow {
  periodo_reporte?: string;
  total_tickets?: number;
  tickets_resueltos?: number;
  tickets_cancelados?: number;
  tickets_rezagados?: number;
  pct_resueltos?: number;
  pct_cancelados?: number;
  pct_rezagados?: number;
  tiempo_medio_cierre_horas?: number;
  tiempo_mediana_cierre_horas?: number;
  tiempo_min_cierre_horas?: number;
  tiempo_max_cierre_horas?: number;
  tiempo_p25_cierre_horas?: number;
  tiempo_p75_cierre_horas?: number;
  tiempo_std_cierre_horas?: number;
  pct_excede_promedio_cierre?: number;
  pct_excede_mediana_cierre?: number;
  tiempo_promedio_primera_respuesta_horas?: number;
}

/** Same metrics as a period row, averaged across periods for one work group. */
export interface SupportGroupSummary {
  total_tickets?: number;
  tickets_resueltos?: number;
  tickets_cancelados?: number;
  tickets_rezagados?: number;
  pct_resueltos?: number;
  pct_cancelados?: number;
  pct_rezagados?: number;
  tiempo_medio_cierre_horas?: number;
  tiempo_mediana_cierre_horas?: number;
  tiempo_promedio_primera_respuesta_horas?: number;
  pct_excede_promedio_cierre?: number;
  pct_excede_mediana_cierre?: number;
}

export interface SupportDashboardProps {
  metrics?: {
    resumen_global?: SupportGlobalSummary;
    por_grupo_trabajo?: Record<string, SupportGroupSummary>;
    historico_tendencias?: SupportHistoricoRow[];
  };
}

/** Every headline number the dashboard renders, averaged over all periods. */
export interface SupportGlobalStats {
  total_tickets: number;
  tickets_resueltos: number;
  tickets_cancelados: number;
  tickets_rezagados: number;
  pct_resueltos: number;
  pct_cancelados: number;
  pct_rezagados: number;
  tiempo_medio_cierre_horas: number;
  tiempo_mediana_cierre_horas: number;
  tiempo_min_cierre_horas: number;
  tiempo_max_cierre_horas: number;
  tiempo_p25_cierre_horas: number;
  tiempo_p75_cierre_horas: number;
  tiempo_std_cierre_horas: number;
  pct_excede_promedio_cierre: number;
  pct_excede_mediana_cierre: number;
  tiempo_promedio_primera_respuesta_horas: number;
}

/** A clickable sparkline: the global average plus its per-period series. */
export interface SupportTrendCard {
  id: string;
  title: string;
  value: string;
  color: MetricColor;
  labels: string[];
  values: number[];
  unitLabel: string;
  /** Percentage series shown on the card. */
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
  /** Mean hours to closure for the group, averaged across periods. */
  mttr: number;
  mttrMediana: number;
  /** Green when the group closes faster than the global mean, red when slower. */
  mttrColor: MetricColor;
  /** Signed gap against the global MTTR, in hours. */
  mttrDelta: number;
  primeraRespuesta: number;
  pctExcedeProm: number;
  pctExcedeMed: number;
}

/**
 * Every measure a dimension row carries.
 *
 * Mirrors `compute_metrics_for_period` in `backend/support/metrics.py`. Closure
 * time appears twice over the same resolved tickets: `cierre` runs from the
 * first assignment (the technician's handling) and `cierre_total` from creation
 * (the whole process). The gap between them is the queue wait.
 *
 * Each `muestra_*` is how many tickets could actually be measured — durations
 * that cannot be computed are dropped, not counted as zero, so a small sample
 * against a large `total_tickets` means the time figures are thin.
 */
export interface SupportDimensionMetrics {
  total_tickets?: number;
  tickets_resueltos?: number;
  tickets_cancelados?: number;
  tickets_rezagados?: number;
  pct_resueltos?: number;
  pct_cancelados?: number;
  pct_rezagados?: number;

  tiempo_medio_cierre_horas?: number;
  tiempo_mediana_cierre_horas?: number;
  tiempo_min_cierre_horas?: number;
  tiempo_p25_cierre_horas?: number;
  tiempo_p75_cierre_horas?: number;
  tiempo_max_cierre_horas?: number;
  tiempo_std_cierre_horas?: number;
  pct_excede_promedio_cierre?: number;
  pct_excede_mediana_cierre?: number;
  muestra_cierre?: number;

  tiempo_medio_cierre_total_horas?: number;
  tiempo_mediana_cierre_total_horas?: number;
  tiempo_min_cierre_total_horas?: number;
  tiempo_p25_cierre_total_horas?: number;
  tiempo_p75_cierre_total_horas?: number;
  tiempo_max_cierre_total_horas?: number;
  tiempo_std_cierre_total_horas?: number;
  pct_excede_promedio_cierre_total?: number;
  pct_excede_mediana_cierre_total?: number;
  muestra_cierre_total?: number;

  tiempo_promedio_primera_respuesta_horas?: number;
  tiempo_medio_primera_respuesta_horas?: number;
  tiempo_mediana_primera_respuesta_horas?: number;
  tiempo_min_primera_respuesta_horas?: number;
  tiempo_p25_primera_respuesta_horas?: number;
  tiempo_p75_primera_respuesta_horas?: number;
  tiempo_max_primera_respuesta_horas?: number;
  tiempo_std_primera_respuesta_horas?: number;
  pct_excede_promedio_primera_respuesta?: number;
  pct_excede_mediana_primera_respuesta?: number;
  muestra_primera_respuesta?: number;

  /** Only set on `razones_falla`: the reason's share of the group's tickets. */
  pct_del_grupo?: number;
}

/** One value of a breakdown dimension — a failure reason, request type, branch. */
export interface SupportDimensionEntry {
  nombre: string;
  metricas?: SupportDimensionMetrics;
}

/** Technical solutions are counted straight off the ticket table, not analysed. */
export interface SupportSolutionEntry {
  nombre: string;
  total?: number;
  pct?: number;
}

/**
 * Ticket load of a zone against its active subscribers.
 *
 * Counted across every work group, because incidence describes the zone's
 * customers rather than how the work was shared out internally.
 */
export interface SupportZoneEntry {
  zona: string;
  site: string;
  tecnologia?: string;
  total_tickets?: number;
  total_suscriptores?: number;
  tasa_incidencia_pct?: number;
  mttr_promedio?: number;
}

/** One work group with the six collections `get_support_analytics_structured` builds. */
export interface SupportGroup {
  total_tickets_grupo?: number;
  metricas_grupo?: SupportDimensionMetrics;
  tipos_solicitud?: SupportDimensionEntry[];
  razones_falla?: SupportDimensionEntry[];
  soluciones_falla?: SupportSolutionEntry[];
  sucursales?: SupportDimensionEntry[];
}

export interface SupportAnalyticsProps {
  analyticsData?: {
    grupos?: Record<string, SupportGroup>;
    /** Period-wide, not per group — see `SupportZoneEntry`. */
    incidencia_zonas?: SupportZoneEntry[];
  };
  periods?: string[];
  selectedPeriod?: string;
}

/** One entry of the group selector, ordered by volume. */
export interface SupportGroupOption {
  key: string;
  label: string;
  totalTickets: number;
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
  pctExcedeMed: number;
  /** Tickets that could actually be measured; 0 means the panel has no data. */
  muestra: number;
}

/** The selected group's headline numbers, with every optional resolved. */
export interface SupportGroupStats {
  totalTickets: number;
  resueltos: number;
  cancelados: number;
  rezagados: number;
  pctResueltos: number;
  pctCancelados: number;
  pctRezagados: number;
  /** Closure measured from the first assignment — the technician's handling. */
  cierre: SupportTimeDistribution;
  /** Closure measured from creation — the whole process, queue included. */
  cierreTotal: SupportTimeDistribution;
  /** Creation → first assignment. */
  primeraRespuesta: SupportTimeDistribution;
  /** The group's share of every ticket in the period, across all groups. */
  sharePct: number;
}

/** A breakdown value flattened so charts and tables read a single level. */
export interface SupportBreakdownRow extends SupportDimensionMetrics {
  nombre: string;
  /** Share of the group's ticket volume, recomputed for every dimension. */
  pctDelGrupo: number;
}

/** A counted technical solution, with its share of the group. */
export interface SupportSolutionRow {
  nombre: string;
  total: number;
  pct: number;
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
  /** No active subscribers on record — the incidence rate is not computable. */
  sinPoblacion: boolean;
}

/** Which breakdown the panel is showing. */
export type SupportBreakdownKey = 'razones' | 'soluciones' | 'tipos' | 'sucursales';

/** One closed monthly period on the Support results table. */
export interface SupportCierre {
  periodo_reporte: string;
  total_tickets: number;
  tickets_resueltos: number;
  pct_resueltos: number;
  pct_cancelados: number;
  pct_rezagados: number;
  tiempo_medio_cierre_horas: number;
  tiempo_mediana_cierre_horas: number;
}

export interface SupportResultsProps {
  historico?: SupportCierre[];
}
