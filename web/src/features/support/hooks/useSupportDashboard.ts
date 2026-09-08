import { useMemo, useState } from 'react';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';

import { CHART_CHROME, SURFACE } from '@/shared/constants/theme';
import { METRIC_CHART, type MetricColor } from '@/shared/ui';
import { formatInteger, formatPeriodoLabel, toNumber } from '@/shared/utils';
import {
  ASIGNACION,
  CIERRE_TOTAL,
  averageField,
  emptyStats,
  resolveStats,
  share,
} from '../lib/supportMetrics';
import type {
  SupportDashboardProps,
  SupportGroupCard,
  SupportHistoricoRow,
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
  rateKey: keyof SupportHistoricoRow;
  countKey: keyof SupportHistoricoRow;
  unitLabel: string;
  unit: SupportTrendCard['unit'];
  color: MetricColor;
}> = [
  { id: 'resueltos', title: 'Tasa Resolución', statKey: 'pct_resueltos', rateKey: 'pct_resueltos', countKey: 'tickets_resueltos', unitLabel: 'Tickets Resueltos', unit: 'tickets', color: 'green' },
  { id: 'cancelados', title: 'Tasa Cancelación', statKey: 'pct_cancelados', rateKey: 'pct_cancelados', countKey: 'tickets_cancelados', unitLabel: 'Tickets Cancelados', unit: 'tickets', color: 'red' },
  { id: 'rezagados', title: 'Tasa de Rezago', statKey: 'pct_rezagados', rateKey: 'pct_rezagados', countKey: 'tickets_rezagados', unitLabel: 'Tickets Rezagados', unit: 'tickets', color: 'yellow' },
  { id: 'cierre_total', title: 'Cierre Total (h)', statKey: `tiempo_medio_${CIERRE_TOTAL}_horas`, rateKey: `tiempo_medio_${CIERRE_TOTAL}_horas`, countKey: `tiempo_medio_${CIERRE_TOTAL}_horas`, unitLabel: 'Horas Creación → Cierre', unit: 'horas', color: 'blue' },
  { id: 'gestion', title: 'Gestión (h)', statKey: 'tiempo_medio_cierre_asignado_cerrados_horas', rateKey: 'tiempo_medio_cierre_asignado_cerrados_horas', countKey: 'tiempo_medio_cierre_asignado_cerrados_horas', unitLabel: 'Horas Asignación → Cierre', unit: 'horas', color: 'purple' },
  { id: 'asignacion', title: 'Asignación (h)', statKey: `tiempo_medio_${ASIGNACION}_horas`, rateKey: `tiempo_medio_${ASIGNACION}_horas`, countKey: `tiempo_medio_${ASIGNACION}_horas`, unitLabel: 'Horas Creación → Asignación', unit: 'horas', color: 'slate' },
];

export function useSupportDashboard({ metrics = {} }: SupportDashboardProps) {
  const historico = useMemo(() => metrics.historico_tendencias ?? [], [metrics]);
  const summary = useMemo(() => metrics.resumen_global ?? {}, [metrics]);
  const grupos = useMemo(() => metrics.por_grupo_trabajo ?? {}, [metrics]);
  const [selectedTrend, setSelectedTrend] = useState<SupportTrendCard | null>(null);

  /**
   * The headline figures are the analyzer's own cross-period average, which
   * already excludes the periods where a measure had no measurable sample.
   * Re-averaging the raw history here would put those zeros back in, so the
   * history is only used as a fallback when the average has not been stored.
   */
  const stats = useMemo<SupportStats>(() => {
    if (Object.keys(summary).length > 0) return resolveStats(summary);
    if (historico.length === 0) return emptyStats();

    const averaged = Object.fromEntries(
      (Object.keys(emptyStats()) as Array<keyof SupportStats>).map((key) => [
        key,
        averageField(historico, key as keyof SupportHistoricoRow),
      ]),
    );
    return averaged as SupportStats;
  }, [summary, historico]);

  const labels = useMemo(
    () => historico.map((row) => formatPeriodoLabel(String(row.periodo_reporte ?? ''))),
    [historico],
  );

  const trendCards = useMemo<SupportTrendCard[]>(
    () =>
      TREND_DEFS.map((def) => ({
        id: def.id,
        title: def.title,
        value: def.unit === 'horas' ? `${stats[def.statKey]} h` : `${stats[def.statKey]}%`,
        color: def.color,
        labels,
        values: historico.map((row) => toNumber(row[def.rateKey] as number | undefined)),
        unitLabel: def.unitLabel,
        rateKey: def.rateKey,
        countKey: def.countKey,
        unit: def.unit,
      })),
    [historico, labels, stats],
  );

  const groupCards = useMemo<SupportGroupCard[]>(() => {
    const entries = Object.entries(grupos);
    const totalVolume = entries.reduce((acc, [, g]) => acc + toNumber(g.total_tickets), 0);
    const globalMttr = stats[`tiempo_medio_${CIERRE_TOTAL}_horas`];

    return entries
      .map(([name, raw]) => {
        const g = resolveStats(raw);
        const mttr = g[`tiempo_medio_${CIERRE_TOTAL}_horas`];

        return {
          id: name,
          label: name,
          color: resolutionColor(g.pct_resueltos),
          totalTickets: g.total_tickets,
          sharePct: share(g.total_tickets, totalVolume),
          pctResueltos: g.pct_resueltos,
          pctCancelados: g.pct_cancelados,
          pctRezagados: g.pct_rezagados,
          mttr,
          mttrMediana: g[`tiempo_mediana_${CIERRE_TOTAL}_horas`],
          mttrColor: mttrColor(mttr, globalMttr),
          mttrDelta: Number((mttr - globalMttr).toFixed(2)),
          espera: g[`tiempo_medio_${ASIGNACION}_horas`],
          pctExcedeProm: g[`pct_excede_promedio_${CIERRE_TOTAL}`],
        };
      })
      .sort((a, b) => b.totalTickets - a.totalTickets);
  }, [grupos, stats]);

  const modalChartData = useMemo<ChartData<'line'> | null>(() => {
    if (!selectedTrend) return null;
    const chart = METRIC_CHART[selectedTrend.color];

    return {
      labels,
      datasets: [{
        label: selectedTrend.unitLabel,
        data: historico.map((row) => toNumber(row[selectedTrend.countKey] as number | undefined)),
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
  }, [selectedTrend, historico, labels]);

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
    periodosEvaluados: metrics.periodos_evaluados ?? historico.length,
    historico,
    stats,
    trendCards,
    groupCards,
    selectedTrend,
    setSelectedTrend,
    modalChartData,
    modalChartOptions,
  };
}
