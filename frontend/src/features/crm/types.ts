import type { MetricColor } from '@/shared/ui';

/**
 * Wire types come from `@/shared/types/crm` — `shared/lib/api` types the CRM
 * responses with them — and are re-exported so this module stays the single
 * import site for anything CRM-shaped.
 */
export type {
  CrmCierre,
  CrmDimensionRow,
  CrmDimensionValue,
  CrmDimensionsResponse,
  CrmEfectividadRow,
  CrmHistoricoRow,
  CrmMetricas,
} from '@/shared/types/crm';

import type { CrmDimensionRow, CrmEfectividadRow, CrmHistoricoRow } from '@/shared/types/crm';

export interface CrmDashboardProps {
  metrics?: {
    historico_tendencias?: CrmHistoricoRow[];
    efectividad?: CrmEfectividadRow[];
  };
  periods?: string[];
}

export interface CrmGlobalStats {
  total_oportunidades: number;
  pct_instalacion: number;
  pct_perdida: number;
  pct_pendientes: number;
  pct_devueltos_e8: number;
  horas_promedio_inst: number;
  horas_mediana_inst: number;
  horas_p25_inst: number;
  horas_p75_inst: number;
  horas_min_inst: number;
  horas_max_inst: number;
  horas_std_inst: number;
  pct_excede_prom_inst: number;
  horas_promedio_perd: number;
  horas_mediana_perd: number;
  horas_p25_perd: number;
  horas_p75_perd: number;
  horas_min_perd: number;
  horas_max_perd: number;
  horas_std_perd: number;
  pct_excede_prom_perd: number;
}

export interface CrmTrendCard {
  id: string;
  title: string;
  value: string;
  color: MetricColor;
  labels: string[];
  values: number[];
  unitLabel: string;
  rateKey: keyof CrmHistoricoRow;
  countKey: keyof CrmHistoricoRow;
}

export interface CrmHealthCard {
  id: string;
  label: string;
  pct: number;
  color: MetricColor;
  successCount: number;
  successPct: number;
  failCount: number;
  failPct: number;
}

export interface CrmAnalyticsProps {
  /** Every dimension of the selected period; the dimension filter is client-side. */
  dimensionsData?: CrmDimensionRow[];
  /** The cierre row of the selected period: global denominators and header stats. */
  globalData?: CrmHistoricoRow;
  periods?: string[];
  selectedPeriod?: string;
}

/** A single "who leads this measure" readout in the ranking section. */
export interface CrmRankingEntry {
  id: string;
  label: string;
  /** Winning dimension value, or `—` when the period has no data. */
  valor: string;
  value: string;
  caption: string;
  color: MetricColor;
}
