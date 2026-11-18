/** Estado y series del dashboard de CRM: tarjetas, tendencias y salud por etapa. */

import { CHART_CHROME, SURFACE } from '@/shared/constants/theme';
import { useMemo, useState } from 'react';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { METRIC_CHART, type MetricColor } from '@/shared/ui';
import { buildHealthCards } from '@/features/crm/lib/crmEffectiveness';
import { formatInteger, formatPeriodLabel } from '@/shared/utils';
import type {
  CrmDashboardProps,
  CrmGlobalStats,
  CrmHealthCard,
  CrmHistoryRow,
  CrmTrendCard,
} from '@/features/crm/types';

const EMPTY_STATS: CrmGlobalStats = {
  total_opportunities: 0,
  pct_installation: 0,
  pct_lost: 0,
  pct_pending: 0,
  pct_returned_e8: 0,
  hours_avg_inst: 0,
  hours_median_inst: 0,
  hours_p25_inst: 0,
  hours_p75_inst: 0,
  hours_min_inst: 0,
  hours_max_inst: 0,
  hours_std_inst: 0,
  pct_over_avg_inst: 0,
  hours_avg_lost: 0,
  hours_median_lost: 0,
  hours_p25_lost: 0,
  hours_p75_lost: 0,
  hours_min_lost: 0,
  hours_max_lost: 0,
  hours_std_lost: 0,
  pct_over_avg_lost: 0,
  hours_avg_close: 0,
  hours_median_close: 0,
  hours_p25_close: 0,
  hours_p75_close: 0,
  hours_min_close: 0,
  hours_max_close: 0,
  hours_std_close: 0,
  pct_over_avg_close: 0,
};

function averageField(rows: CrmHistoryRow[], key: keyof CrmHistoryRow, digits = 2): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  return Number((sum / rows.length).toFixed(digits));
}

const TREND_DEFS: Array<{
  id: string;
  title: string;
  valueKey: keyof CrmHistoryRow;
  rateKey: keyof CrmHistoryRow;
  countKey: keyof CrmHistoryRow;
  unitLabel: string;
  color: MetricColor;
}> = [
  { id: 'instalacion', title: 'Tasa Instalación', valueKey: 'pct_installation', rateKey: 'pct_installation', countKey: 'won', unitLabel: 'Ganados / Instalados', color: 'green' },
  { id: 'perdida', title: 'Tasa Pérdida', valueKey: 'pct_lost', rateKey: 'pct_lost', countKey: 'lost', unitLabel: 'Oportunidades Perdidas', color: 'red' },
  { id: 'pending', title: 'Tasa Pendientes', valueKey: 'pct_pending', rateKey: 'pct_pending', countKey: 'pending', unitLabel: 'Oportunidades en Curso', color: 'blue' },
  { id: 'devueltos', title: 'Prospectos Devueltos (E8)', valueKey: 'pct_returned_e8', rateKey: 'pct_returned_e8', countKey: 'count_returned_e8', unitLabel: 'Transiciones a Etapa 8', color: 'yellow' },
];

export function useCrmDashboard({ metrics = {} }: CrmDashboardProps) {
  const history = useMemo(() => metrics.trend_history ?? [], [metrics]);
  const effectiveness = useMemo(() => metrics.effectiveness ?? [], [metrics]);
  const [selectedTrend, setSelectedTrend] = useState<CrmTrendCard | null>(null);

  const stats = useMemo<CrmGlobalStats>(() => {
    const n = history.length;
    if (n === 0) return EMPTY_STATS;

    return {
      total_opportunities: Math.round(averageField(history, 'total_opportunities', 0)),
      pct_installation: averageField(history, 'pct_installation'),
      pct_lost: averageField(history, 'pct_lost'),
      pct_pending: averageField(history, 'pct_pending'),
      pct_returned_e8: averageField(history, 'pct_returned_e8'),
      hours_avg_inst: averageField(history, 'hours_avg_inst'),
      hours_median_inst: averageField(history, 'hours_median_inst'),
      hours_p25_inst: averageField(history, 'hours_p25_inst'),
      hours_p75_inst: averageField(history, 'hours_p75_inst'),
      hours_min_inst: averageField(history, 'hours_min_inst'),
      hours_max_inst: averageField(history, 'hours_max_inst'),
      hours_std_inst: averageField(history, 'hours_std_inst'),
      pct_over_avg_inst: averageField(history, 'pct_over_avg_inst'),
      hours_avg_lost: averageField(history, 'hours_avg_lost'),
      hours_median_lost: averageField(history, 'hours_median_lost'),
      hours_p25_lost: averageField(history, 'hours_p25_lost'),
      hours_p75_lost: averageField(history, 'hours_p75_lost'),
      hours_min_lost: averageField(history, 'hours_min_lost'),
      hours_max_lost: averageField(history, 'hours_max_lost'),
      hours_std_lost: averageField(history, 'hours_std_lost'),
      pct_over_avg_lost: averageField(history, 'pct_over_avg_lost'),
      hours_avg_close: averageField(history, 'hours_avg_close'),
      hours_median_close: averageField(history, 'hours_median_close'),
      hours_p25_close: averageField(history, 'hours_p25_close'),
      hours_p75_close: averageField(history, 'hours_p75_close'),
      hours_min_close: averageField(history, 'hours_min_close'),
      hours_max_close: averageField(history, 'hours_max_close'),
      hours_std_close: averageField(history, 'hours_std_close'),
      pct_over_avg_close: averageField(history, 'pct_over_avg_close'),
    };
  }, [history]);

  const labels = useMemo(
    () => history.map((row) => formatPeriodLabel(String(row.report_period ?? ''))),
    [history],
  );

  const trendCards = useMemo<CrmTrendCard[]>(() => TREND_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    value: `${stats[def.valueKey as keyof CrmGlobalStats]}%`,
    color: def.color,
    labels,
    values: history.map((row) => Number(row[def.rateKey]) || 0),
    unitLabel: def.unitLabel,
    rateKey: def.rateKey,
    countKey: def.countKey,
  })), [history, labels, stats]);

  const healthCards = useMemo<CrmHealthCard[]>(() => buildHealthCards(effectiveness), [effectiveness]);

  const modalChartData = useMemo<ChartData<'line'> | null>(() => {
    if (!selectedTrend) return null;
    const chart = METRIC_CHART[selectedTrend.color];
    return {
      labels,
      datasets: [{
        label: `Total ${selectedTrend.unitLabel}`,
        data: history.map((row) => Number(row[selectedTrend.countKey]) || 0),
        borderColor: chart.line,
        backgroundColor: chart.fill.replace('0.1', '0.25'),
        fill: true,
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: chart.line,
        pointBorderColor: SURFACE.primary,
        pointBorderWidth: 2,
        pointHoverRadius: 8,
        tension: 0.35,
      }],
    };
  }, [selectedTrend, history, labels]);

  const modalChartOptions: ChartOptions<'line'> = useMemo(() => {
    const lineColor = selectedTrend ? METRIC_CHART[selectedTrend.color].line : CHART_CHROME.textStrong;
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: SURFACE.primary,
          titleColor: CHART_CHROME.textStrong,
          bodyColor: lineColor,
          borderColor: CHART_CHROME.border,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          callbacks: {
            label: (ctx: TooltipItem<'line'>) => ` ${String(ctx.dataset.label)}: ${formatInteger(ctx.raw as number)} casos`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: CHART_CHROME.gridSoft },
          ticks: { color: CHART_CHROME.textAxis, font: { size: 11, weight: 'bold' } },
        },
        y: {
          min: 0,
          grid: { color: CHART_CHROME.gridSoft },
          ticks: { color: CHART_CHROME.textAxis, font: { size: 11 }, callback: (v: number | string) => formatInteger(v as number) },
        },
      },
    };
  }, [selectedTrend]);

  return {
    history,
    stats,
    trendCards,
    healthCards,
    selectedTrend,
    setSelectedTrend,
    modalChartData,
    modalChartOptions,
  };
}
