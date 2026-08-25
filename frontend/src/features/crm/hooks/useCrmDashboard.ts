import { SURFACE } from '@/shared/constants/theme';
import { useMemo, useState } from 'react';
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { METRIC_CHART, type MetricColor } from '@/shared/ui';
import { formatPeriodoLabel } from '@/shared/utils';
import type {
  CrmDashboardProps,
  CrmGlobalStats,
  CrmHealthCard,
  CrmHistoricoRow,
  CrmTrendCard,
} from '@/features/crm/types';

const EMPTY_STATS: CrmGlobalStats = {
  total_oportunidades: 0,
  pct_instalacion: 0,
  pct_perdida: 0,
  pct_pendientes: 0,
  pct_devueltos_e8: 0,
  horas_promedio_inst: 0,
  horas_mediana_inst: 0,
  horas_p25_inst: 0,
  horas_p75_inst: 0,
  horas_min_inst: 0,
  horas_max_inst: 0,
  horas_std_inst: 0,
  pct_excede_prom_inst: 0,
  pct_excede_med_inst: 0,
  horas_promedio_perd: 0,
  horas_mediana_perd: 0,
  horas_p25_perd: 0,
  horas_p75_perd: 0,
  horas_min_perd: 0,
  horas_max_perd: 0,
  horas_std_perd: 0,
  pct_excede_prom_perd: 0,
  pct_excede_med_perd: 0,
};

function averageField(rows: CrmHistoricoRow[], key: keyof CrmHistoricoRow, digits = 2): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  return Number((sum / rows.length).toFixed(digits));
}

function healthColor(pct: number): MetricColor {
  if (pct >= 80) return 'green';
  if (pct >= 60) return 'yellow';
  return 'red';
}

function formatEtapaLabel(etapa: string): string {
  return etapa.replace('etapa_', '').replace('_', ' ');
}

const TREND_DEFS: Array<{
  id: string;
  title: string;
  valueKey: keyof CrmHistoricoRow;
  rateKey: keyof CrmHistoricoRow;
  countKey: keyof CrmHistoricoRow;
  unitLabel: string;
  color: MetricColor;
}> = [
  { id: 'instalacion', title: 'Tasa Instalación', valueKey: 'pct_instalacion', rateKey: 'pct_instalacion', countKey: 'ganados', unitLabel: 'Ganados / Instalados', color: 'green' },
  { id: 'perdida', title: 'Tasa Pérdida', valueKey: 'pct_perdida', rateKey: 'pct_perdida', countKey: 'perdidos', unitLabel: 'Oportunidades Perdidas', color: 'red' },
  { id: 'pendientes', title: 'Tasa Pendientes', valueKey: 'pct_pendientes', rateKey: 'pct_pendientes', countKey: 'pendientes', unitLabel: 'Oportunidades en Curso', color: 'blue' },
  { id: 'devueltos', title: 'Prospectos Devueltos (E8)', valueKey: 'pct_devueltos_e8', rateKey: 'pct_devueltos_e8', countKey: 'count_devueltos_e8', unitLabel: 'Devueltos a Etapa 8', color: 'yellow' },
];

export function useCrmDashboard({ metrics = {} }: CrmDashboardProps) {
  const historico = useMemo(() => metrics.historico_tendencias ?? [], [metrics]);
  const efectividad = useMemo(() => metrics.efectividad ?? [], [metrics]);
  const [selectedTrend, setSelectedTrend] = useState<CrmTrendCard | null>(null);

  const stats = useMemo<CrmGlobalStats>(() => {
    const n = historico.length;
    if (n === 0) return EMPTY_STATS;

    return {
      total_oportunidades: Math.round(averageField(historico, 'total_oportunidades', 0)),
      pct_instalacion: averageField(historico, 'pct_instalacion'),
      pct_perdida: averageField(historico, 'pct_perdida'),
      pct_pendientes: averageField(historico, 'pct_pendientes'),
      pct_devueltos_e8: averageField(historico, 'pct_devueltos_e8'),
      horas_promedio_inst: averageField(historico, 'horas_promedio_inst'),
      horas_mediana_inst: averageField(historico, 'horas_mediana_inst'),
      horas_p25_inst: averageField(historico, 'horas_p25_inst'),
      horas_p75_inst: averageField(historico, 'horas_p75_inst'),
      horas_min_inst: averageField(historico, 'horas_min_inst'),
      horas_max_inst: averageField(historico, 'horas_max_inst'),
      horas_std_inst: averageField(historico, 'horas_std_inst'),
      pct_excede_prom_inst: averageField(historico, 'pct_excede_prom_inst'),
      pct_excede_med_inst: averageField(historico, 'pct_excede_med_inst'),
      horas_promedio_perd: averageField(historico, 'horas_promedio_perd'),
      horas_mediana_perd: averageField(historico, 'horas_mediana_perd'),
      horas_p25_perd: averageField(historico, 'horas_p25_perd'),
      horas_p75_perd: averageField(historico, 'horas_p75_perd'),
      horas_min_perd: averageField(historico, 'horas_min_perd'),
      horas_max_perd: averageField(historico, 'horas_max_perd'),
      horas_std_perd: averageField(historico, 'horas_std_perd'),
      pct_excede_prom_perd: averageField(historico, 'pct_excede_prom_perd'),
      pct_excede_med_perd: averageField(historico, 'pct_excede_med_perd'),
    };
  }, [historico]);

  const labels = useMemo(
    () => historico.map((row) => formatPeriodoLabel(String(row.periodo_reporte ?? ''))),
    [historico],
  );

  const trendCards = useMemo<CrmTrendCard[]>(() => TREND_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    value: `${stats[def.valueKey as keyof CrmGlobalStats]}%`,
    color: def.color,
    labels,
    values: historico.map((row) => Number(row[def.rateKey]) || 0),
    unitLabel: def.unitLabel,
    rateKey: def.rateKey,
    countKey: def.countKey,
  })), [historico, labels, stats]);

  const healthCards = useMemo<CrmHealthCard[]>(() => efectividad.map((row) => {
    const total = Number(row.total_salidas) || 0;
    const successCount = Number(row.exitosos) || 0;
    const failCount = Number(row.fallidos) || 0;
    const pct = Number(row.efectividad_pct) || 0;
    return {
      id: String(row.etapa ?? ''),
      label: formatEtapaLabel(String(row.etapa ?? '')),
      pct,
      color: healthColor(pct),
      successCount,
      successPct: total > 0 ? Math.round((successCount / total) * 100) : 0,
      failCount,
      failPct: total > 0 ? Math.round((failCount / total) * 100) : 0,
    };
  }), [efectividad]);

  const modalChartData = useMemo<ChartData<'line'> | null>(() => {
    if (!selectedTrend) return null;
    const chart = METRIC_CHART[selectedTrend.color];
    return {
      labels,
      datasets: [{
        label: `Total ${selectedTrend.unitLabel}`,
        data: historico.map((row) => Number(row[selectedTrend.countKey]) || 0),
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
            label: (ctx: TooltipItem<'line'>) => ` ${String(ctx.dataset.label)}: ${Number(ctx.raw).toLocaleString()} casos`,
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
    healthCards,
    selectedTrend,
    setSelectedTrend,
    modalChartData,
    modalChartOptions,
  };
}
