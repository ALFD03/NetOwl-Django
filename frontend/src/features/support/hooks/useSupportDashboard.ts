import { useMemo, useState } from 'react';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';

import { CHART_CHROME, SURFACE } from '@/shared/constants/theme';
import { METRIC_CHART, type MetricColor } from '@/shared/ui';
import { formatInteger, formatPeriodLabel, toNumber } from '@/shared/utils';
import {
  ASSIGNMENT,
  CLOSE_TOTAL,
  averageField,
  emptyStats,
  resolveStats,
  share,
} from '../lib/supportMetrics';
import type {
  SupportDashboardProps,
  SupportGroupCard,
  SupportHistoryRow,
  SupportStats,
  SupportTrendCard,
} from '../types';

function resolutionColor(pct: number): MetricColor {
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'yellow';
  return 'red';
}

/**
 * Closure speed is only meaningful against the global mean: a group 10% either
 * side of it is on par, beyond that it is visibly faster or slower.
 */
function mttrColor(groupMttr: number, globalMttr: number): MetricColor {
  if (globalMttr <= 0 || groupMttr <= 0) return 'slate';
  const ratio = groupMttr / globalMttr;
  if (ratio <= 0.9) return 'green';
  if (ratio <= 1.1) return 'blue';
  return 'red';
}

/**
 * The sparkline matrix: the three rates, then one clock per formula.
 *
 * `rateKey` is the series drawn on the card and `countKey` the one the modal
 * charts. For a time measure both are the same column — there is no separate
 * volume behind an average of hours, and pretending otherwise would draw the
 * same line twice under two different labels.
 */
const TREND_DEFS: Array<{
  id: string;
  title: string;
  statKey: keyof SupportStats;
  rateKey: keyof SupportHistoryRow;
  countKey: keyof SupportHistoryRow;
  unitLabel: string;
  unit: SupportTrendCard['unit'];
  color: MetricColor;
}> = [
  { id: 'resueltos', title: 'Tasa Resolución', statKey: 'pct_resolved', rateKey: 'pct_resolved', countKey: 'tickets_resolved', unitLabel: 'Tickets Resueltos', unit: 'tickets', color: 'green' },
  { id: 'cancelados', title: 'Tasa Cancelación', statKey: 'pct_cancelled', rateKey: 'pct_cancelled', countKey: 'tickets_cancelled', unitLabel: 'Tickets Cancelados', unit: 'tickets', color: 'red' },
  { id: 'escalados', title: 'Tasa de Escalamiento', statKey: 'pct_escalated', rateKey: 'pct_escalated', countKey: 'tickets_escalated', unitLabel: 'Tickets Escalados a Soporte', unit: 'tickets', color: 'yellow' },
  { id: 'rezagados', title: 'Tasa de Rezago', statKey: 'pct_lagging', rateKey: 'pct_lagging', countKey: 'tickets_lagging', unitLabel: 'Tickets Rezagados', unit: 'tickets', color: 'yellow' },
  { id: 'cierre_total', title: 'Cierre Total (h)', statKey: `time_mean_${CLOSE_TOTAL}_hours`, rateKey: `time_mean_${CLOSE_TOTAL}_hours`, countKey: `time_mean_${CLOSE_TOTAL}_hours`, unitLabel: 'Horas Creación → Cierre', unit: 'horas', color: 'blue' },
  { id: 'gestion', title: 'Gestión (h)', statKey: 'time_mean_close_assigned_closed_hours', rateKey: 'time_mean_close_assigned_closed_hours', countKey: 'time_mean_close_assigned_closed_hours', unitLabel: 'Horas Asignación → Cierre', unit: 'horas', color: 'purple' },
  { id: 'assignment', title: 'Asignación (h)', statKey: `time_mean_${ASSIGNMENT}_hours`, rateKey: `time_mean_${ASSIGNMENT}_hours`, countKey: `time_mean_${ASSIGNMENT}_hours`, unitLabel: 'Horas Creación → Asignación', unit: 'horas', color: 'slate' },
];

export function useSupportDashboard({ metrics = {} }: SupportDashboardProps) {
  const history = useMemo(() => metrics.trend_history ?? [], [metrics]);
  const summary = useMemo(() => metrics.global_summary ?? {}, [metrics]);
  const groups = useMemo(() => metrics.by_work_group ?? {}, [metrics]);
  const [selectedTrend, setSelectedTrend] = useState<SupportTrendCard | null>(null);

  /**
   * The headline figures are the analyzer's own cross-period average, which
   * already excludes the periods where a measure had no measurable sample.
   * Re-averaging the raw history here would put those zeros back in, so the
   * history is only used as a fallback when the average has not been stored.
   */
  const stats = useMemo<SupportStats>(() => {
    if (Object.keys(summary).length > 0) return resolveStats(summary);
    if (history.length === 0) return emptyStats();

    const averaged = Object.fromEntries(
      (Object.keys(emptyStats()) as Array<keyof SupportStats>).map((key) => [
        key,
        averageField(history, key as keyof SupportHistoryRow),
      ]),
    );
    return averaged as SupportStats;
  }, [summary, history]);

  const labels = useMemo(
    () => history.map((row) => formatPeriodLabel(String(row.report_period ?? ''))),
    [history],
  );

  const trendCards = useMemo<SupportTrendCard[]>(
    () =>
      TREND_DEFS.map((def) => ({
        id: def.id,
        title: def.title,
        value: def.unit === 'horas' ? `${stats[def.statKey]} h` : `${stats[def.statKey]}%`,
        color: def.color,
        labels,
        values: history.map((row) => toNumber(row[def.rateKey] as number | undefined)),
        unitLabel: def.unitLabel,
        rateKey: def.rateKey,
        countKey: def.countKey,
        unit: def.unit,
      })),
    [history, labels, stats],
  );

  const groupCards = useMemo<SupportGroupCard[]>(() => {
    const entries = Object.entries(groups);
    const totalVolume = entries.reduce((acc, [, g]) => acc + toNumber(g.total_tickets), 0);
    const globalMttr = stats[`time_mean_${CLOSE_TOTAL}_hours`];

    return entries
      .map(([name, raw]) => {
        const g = resolveStats(raw);
        const mttr = g[`time_mean_${CLOSE_TOTAL}_hours`];

        return {
          id: name,
          label: name,
          color: resolutionColor(g.pct_resolved),
          totalTickets: g.total_tickets,
          sharePct: share(g.total_tickets, totalVolume),
          pctResolved: g.pct_resolved,
          pctCancelled: g.pct_cancelled,
          pctLagging: g.pct_lagging,
          pctEscalated: g.pct_escalated,
          mttr,
          mttrMedian: g[`time_median_${CLOSE_TOTAL}_hours`],
          mttrColor: mttrColor(mttr, globalMttr),
          mttrDelta: Number((mttr - globalMttr).toFixed(2)),
          wait: g[`time_mean_${ASSIGNMENT}_hours`],
          pctAboveAvg: g[`pct_over_avg_${CLOSE_TOTAL}`],
        };
      })
      .sort((a, b) => b.totalTickets - a.totalTickets);
  }, [groups, stats]);

  const modalChartData = useMemo<ChartData<'line'> | null>(() => {
    if (!selectedTrend) return null;
    const chart = METRIC_CHART[selectedTrend.color];

    return {
      labels,
      datasets: [{
        label: selectedTrend.unitLabel,
        data: history.map((row) => toNumber(row[selectedTrend.countKey] as number | undefined)),
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
    const suffix = selectedTrend?.unit === 'horas' ? 'h' : 'tickets';

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
            label: (ctx: TooltipItem<'line'>) =>
              ` ${String(ctx.dataset.label)}: ${formatInteger(ctx.raw as number)} ${suffix}`,
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
    evaluatedPeriods: metrics.evaluated_periods ?? history.length,
    history,
    stats,
    trendCards,
    groupCards,
    selectedTrend,
    setSelectedTrend,
    modalChartData,
    modalChartOptions,
  };
}
