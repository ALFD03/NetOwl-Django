import { useMemo, useState } from 'react';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';

import { SURFACE } from '@/shared/constants/theme';
import { METRIC_CHART, type MetricColor } from '@/shared/ui';
import { formatPeriodoLabel, toNumber } from '@/shared/utils';
import {
  SUPPORT_TIME_MEASURES,
  type SupportDashboardProps,
  type SupportGlobalStats,
  type SupportGlobalSummary,
  type SupportGroupCard,
  type SupportGroupSummary,
  type SupportHistoricoRow,
  type SupportTimeStats,
  type SupportTrendCard,
} from '@/features/support/types';

/** The ten scalar keys the backend stores for one measure. */
function timeStatKeys(medida: string): Array<keyof SupportTimeStats> {
  return [
    `tiempo_medio_${medida}_horas`,
    `tiempo_mediana_${medida}_horas`,
    `tiempo_min_${medida}_horas`,
    `tiempo_p25_${medida}_horas`,
    `tiempo_p75_${medida}_horas`,
    `tiempo_max_${medida}_horas`,
    `tiempo_std_${medida}_horas`,
    `pct_excede_promedio_${medida}`,
    `pct_excede_mediana_${medida}`,
    `muestra_${medida}`,
  ] as Array<keyof SupportTimeStats>;
}

const TIME_STAT_KEYS: Array<keyof SupportTimeStats> = SUPPORT_TIME_MEASURES.flatMap(timeStatKeys);

/** Sixty zeroed time columns — too many to spell out one by one. */
function emptyTimeStats(): SupportTimeStats {
  return Object.fromEntries(TIME_STAT_KEYS.map((key) => [key, 0])) as SupportTimeStats;
}

const EMPTY_STATS: SupportGlobalStats = {
  ...emptyTimeStats(),
  total_tickets: 0,
  tickets_resueltos: 0,
  tickets_cancelados: 0,
  tickets_rezagados: 0,
  pct_resueltos: 0,
  pct_cancelados: 0,
  pct_rezagados: 0,
  tiempo_promedio_primera_respuesta_horas: 0,
};

function averageField(rows: SupportHistoricoRow[], key: keyof SupportHistoricoRow, digits = 2): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, row) => acc + toNumber(row[key] as number | undefined), 0);
  return Number((sum / rows.length).toFixed(digits));
}

/**
 * Fallback for the case where `historico_tendencias` is empty but the analyzer
 * already persisted its own cross-period average, which now carries every time
 * column, quartiles included.
 */
function statsFromSummary(summary: SupportGlobalSummary): SupportGlobalStats {
  const times = Object.fromEntries(
    TIME_STAT_KEYS.map((key) => [key, toNumber(summary[key])]),
  ) as SupportTimeStats;

  return {
    ...EMPTY_STATS,
    ...times,
    total_tickets: Math.round(toNumber(summary.total_tickets_promedio_mensual)),
    tickets_resueltos: Math.round(toNumber(summary.tickets_resueltos_promedio_mensual)),
    tickets_cancelados: Math.round(toNumber(summary.tickets_cancelados_promedio_mensual)),
    tickets_rezagados: Math.round(toNumber(summary.tickets_rezagados_promedio_mensual)),
    pct_resueltos: toNumber(summary.pct_resueltos),
    pct_cancelados: toNumber(summary.pct_cancelados),
    pct_rezagados: toNumber(summary.pct_rezagados),
    tiempo_promedio_primera_respuesta_horas: toNumber(summary.tiempo_promedio_primera_respuesta_horas),
  };
}

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

const TREND_DEFS: Array<{
  id: string;
  title: string;
  statKey: keyof SupportGlobalStats;
  rateKey: keyof SupportHistoricoRow;
  countKey: keyof SupportHistoricoRow;
  unitLabel: string;
  unit: SupportTrendCard['unit'];
  color: MetricColor;
}> = [
  { id: 'resueltos', title: 'Tasa Resolución', statKey: 'pct_resueltos', rateKey: 'pct_resueltos', countKey: 'tickets_resueltos', unitLabel: 'Tickets Resueltos', unit: 'tickets', color: 'green' },
  { id: 'cancelados', title: 'Tasa Cancelación', statKey: 'pct_cancelados', rateKey: 'pct_cancelados', countKey: 'tickets_cancelados', unitLabel: 'Tickets Cancelados', unit: 'tickets', color: 'red' },
  { id: 'rezagados', title: 'Tasa Rezago', statKey: 'pct_rezagados', rateKey: 'pct_rezagados', countKey: 'tickets_rezagados', unitLabel: 'Tickets Rezagados', unit: 'tickets', color: 'yellow' },
  // El color codifica la población, no la fórmula: azul = solo resueltos,
  // morado = resueltos + cancelados. `MetricColor` solo tiene seis tokens y las
  // tres tarjetas de tasa ya usan verde, rojo y amarillo.
  { id: 'mttr_total', title: 'MTTR — Éxito Total', statKey: 'tiempo_medio_cierre_total_horas', rateKey: 'tiempo_medio_cierre_total_horas', countKey: 'tiempo_medio_cierre_total_horas', unitLabel: 'Horas Creación → Cierre', unit: 'horas', color: 'blue' },
  { id: 'mttr', title: 'MTTR — Éxito', statKey: 'tiempo_medio_cierre_horas', rateKey: 'tiempo_medio_cierre_horas', countKey: 'tiempo_medio_cierre_horas', unitLabel: 'Horas Asignación → Cierre', unit: 'horas', color: 'blue' },
  { id: 'mttr_total_global', title: 'MTTR — Global Total', statKey: 'tiempo_medio_cierre_total_global_horas', rateKey: 'tiempo_medio_cierre_total_global_horas', countKey: 'tiempo_medio_cierre_total_global_horas', unitLabel: 'Horas Creación → Cierre', unit: 'horas', color: 'purple' },
  { id: 'mttr_global', title: 'MTTR — Global', statKey: 'tiempo_medio_cierre_global_horas', rateKey: 'tiempo_medio_cierre_global_horas', countKey: 'tiempo_medio_cierre_global_horas', unitLabel: 'Horas Asignación → Cierre', unit: 'horas', color: 'purple' },
  { id: 'respuesta', title: '1ª Respuesta — Éxito', statKey: 'tiempo_medio_primera_respuesta_horas', rateKey: 'tiempo_medio_primera_respuesta_horas', countKey: 'tiempo_medio_primera_respuesta_horas', unitLabel: 'Horas Creación → Asignación', unit: 'horas', color: 'slate' },
  { id: 'respuesta_global', title: '1ª Respuesta — Global', statKey: 'tiempo_medio_primera_respuesta_global_horas', rateKey: 'tiempo_medio_primera_respuesta_global_horas', countKey: 'tiempo_medio_primera_respuesta_global_horas', unitLabel: 'Horas Creación → Asignación', unit: 'horas', color: 'slate' },
];

export function useSupportDashboard({ metrics = {} }: SupportDashboardProps) {
  const historico = useMemo(() => metrics.historico_tendencias ?? [], [metrics]);
  const summary = useMemo(() => metrics.resumen_global ?? {}, [metrics]);
  const grupos = useMemo(() => metrics.por_grupo_trabajo ?? {}, [metrics]);
  const [selectedTrend, setSelectedTrend] = useState<SupportTrendCard | null>(null);

  const stats = useMemo<SupportGlobalStats>(() => {
    if (historico.length === 0) return statsFromSummary(summary);

    const times = Object.fromEntries(
      TIME_STAT_KEYS.map((key) => [key, averageField(historico, key)]),
    ) as SupportTimeStats;

    return {
      ...times,
      total_tickets: Math.round(averageField(historico, 'total_tickets', 0)),
      tickets_resueltos: Math.round(averageField(historico, 'tickets_resueltos', 0)),
      tickets_cancelados: Math.round(averageField(historico, 'tickets_cancelados', 0)),
      tickets_rezagados: Math.round(averageField(historico, 'tickets_rezagados', 0)),
      pct_resueltos: averageField(historico, 'pct_resueltos'),
      pct_cancelados: averageField(historico, 'pct_cancelados'),
      pct_rezagados: averageField(historico, 'pct_rezagados'),
      tiempo_promedio_primera_respuesta_horas: averageField(historico, 'tiempo_promedio_primera_respuesta_horas'),
    };
  }, [historico, summary]);

  const labels = useMemo(
    () => historico.map((row) => formatPeriodoLabel(String(row.periodo_reporte ?? ''))),
    [historico],
  );

  const trendCards = useMemo<SupportTrendCard[]>(() => TREND_DEFS.map((def) => {
    const stat = stats[def.statKey];
    return {
      id: def.id,
      title: def.title,
      value: def.unit === 'horas' ? `${stat} h` : `${stat}%`,
      color: def.color,
      labels,
      values: historico.map((row) => toNumber(row[def.rateKey] as number | undefined)),
      unitLabel: def.unitLabel,
      rateKey: def.rateKey,
      countKey: def.countKey,
      unit: def.unit,
    };
  }), [historico, labels, stats]);

  const groupCards = useMemo<SupportGroupCard[]>(() => {
    const entries = Object.entries(grupos) as Array<[string, SupportGroupSummary]>;
    const totalVolume = entries.reduce((acc, [, g]) => acc + toNumber(g.total_tickets), 0);

    return entries
      .map(([name, g]) => {
        const totalTickets = toNumber(g.total_tickets);
        const pctResueltos = toNumber(g.pct_resueltos);
        const mttr = toNumber(g.tiempo_medio_cierre_horas);
        return {
          id: name,
          label: name,
          color: resolutionColor(pctResueltos),
          totalTickets,
          sharePct: totalVolume > 0 ? Number(((totalTickets / totalVolume) * 100).toFixed(1)) : 0,
          pctResueltos,
          pctCancelados: toNumber(g.pct_cancelados),
          pctRezagados: toNumber(g.pct_rezagados),
          mttr,
          mttrMediana: toNumber(g.tiempo_mediana_cierre_horas),
          mttrColor: mttrColor(mttr, stats.tiempo_medio_cierre_horas),
          mttrDelta: Number((mttr - stats.tiempo_medio_cierre_horas).toFixed(2)),
          primeraRespuesta: toNumber(g.tiempo_promedio_primera_respuesta_horas),
          pctExcedeProm: toNumber(g.pct_excede_promedio_cierre),
          pctExcedeMed: toNumber(g.pct_excede_mediana_cierre),
        };
      })
      .sort((a, b) => b.totalTickets - a.totalTickets);
  }, [grupos, stats.tiempo_medio_cierre_horas]);

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
    const lineColor = selectedTrend ? METRIC_CHART[selectedTrend.color].line : '#fff';
    const suffix = selectedTrend?.unit === 'horas' ? 'h' : 'tickets';
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: SURFACE.primary,
          titleColor: '#fff',
          bodyColor: lineColor,
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          callbacks: {
            label: (ctx: TooltipItem<'line'>) => ` ${String(ctx.dataset.label)}: ${Number(ctx.raw).toLocaleString()} ${suffix}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.25)' },
          ticks: { color: '#94a3b8', font: { size: 11, weight: 'bold' } },
        },
        y: {
          min: 0,
          grid: { color: 'rgba(51, 65, 85, 0.25)' },
          ticks: { color: '#94a3b8', font: { size: 11 }, callback: (v: number | string) => Number(v).toLocaleString() },
        },
      },
    };
  }, [selectedTrend]);

  return {
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
