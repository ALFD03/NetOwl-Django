/** Tipos del feature de CRM, más los de transporte que reexporta de `shared`. */

import type { MetricColor } from '@/shared/ui';

/**
 * Wire types come from `@/shared/types/crm` — `shared/lib/api` types the CRM
 * responses with them — and are re-exported so this module stays the single
 * import site for anything CRM-shaped.
 */
export type {
  CrmClose,
  CrmDimensionRow,
  CrmDimensionValue,
  CrmEffectivenessRow,
  CrmHistoryRow,
  CrmStageTimeRow,
} from '@/shared/types/crm';

import type { CrmDimensionRow, CrmEffectivenessRow, CrmHistoryRow } from '@/shared/types/crm';
import type { DayCuts } from '@/shared/types/domain';

export interface CrmDashboardProps {
  metrics?: {
    trend_history?: CrmHistoryRow[];
    effectiveness?: CrmEffectivenessRow[];
  };
  periods?: string[];
}

export interface CrmGlobalStats {
  total_opportunities: number;
  pct_installation: number;
  pct_lost: number;
  pct_pending: number;
  pct_returned_e8: number;
  hours_avg_inst: number;
  hours_median_inst: number;
  hours_p25_inst: number;
  hours_p75_inst: number;
  hours_min_inst: number;
  hours_max_inst: number;
  hours_std_inst: number;
  pct_over_avg_inst: number;
  hours_avg_lost: number;
  hours_median_lost: number;
  hours_p25_lost: number;
  hours_p75_lost: number;
  hours_min_lost: number;
  hours_max_lost: number;
  hours_std_lost: number;
  pct_over_avg_lost: number;
  hours_avg_close: number;
  hours_median_close: number;
  hours_p25_close: number;
  hours_p75_close: number;
  hours_min_close: number;
  hours_max_close: number;
  hours_std_close: number;
  pct_over_avg_close: number;
}

export interface CrmTrendCard {
  id: string;
  title: string;
  value: string;
  color: MetricColor;
  labels: string[];
  values: number[];
  unitLabel: string;
  rateKey: keyof CrmHistoryRow;
  countKey: keyof CrmHistoryRow;
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
  globalData?: CrmHistoryRow;
  /**
   * Which days of the month have a cut computed, and which one is on screen.
   * The cut itself arrives in `dimensionsData` / `globalData`, already swapped
   * by the view — a day is a partial reload, not a client-side regroup.
   */
  dayMetrics?: DayCuts;
  periods?: string[];
  selectedPeriod?: string;
}

/** El corte completo de un día, tal y como lo sirve `/api/crm/day-metrics/`. */
export interface CrmDayPayload {
  global: CrmHistoryRow;
  dimensions: CrmDimensionRow[];
}

/** A single "who leads this measure" readout in the ranking section. */
export interface CrmRankingEntry {
  id: string;
  label: string;
  /** Winning dimension value, or `—` when the period has no data. */
  winner: string;
  value: string;
  caption: string;
  color: MetricColor;
}
