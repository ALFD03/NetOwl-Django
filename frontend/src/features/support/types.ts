export interface SupportAnalysisRequest { month: string | null; }
export interface SupportAnalysisResponse { message: string; log_output?: string; }

/** Headline ticket metrics averaged across the analysed periods. */
export interface SupportGlobalSummary {
  pct_resueltos?: number;
  tiempo_medio_cierre_horas?: number;
  tiempo_mediana_cierre_horas?: number;
  pct_cancelados?: number;
  pct_rezagados?: number;
  pct_excede_promedio_cierre?: number;
  pct_excede_mediana_cierre?: number;
}

export interface SupportDashboardProps {
  metrics?: { resumen_global?: SupportGlobalSummary };
}

export interface SupportFailureReason {
  nombre: string;
  metricas?: { total_tickets?: number };
}

export interface SupportGroup {
  total_tickets_grupo?: number;
  razones_falla?: SupportFailureReason[];
}

export interface SupportAnalyticsProps {
  analyticsData?: { grupos?: Record<string, SupportGroup> };
  periods?: string[];
}

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
