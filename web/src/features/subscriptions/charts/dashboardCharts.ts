/** Constructores de los gráficos del dashboard de suscripciones. */

import { CHART_CHROME, CHART_PALETTE, SURFACE } from '@/shared/constants/theme';
import type { ChartData, ChartOptions } from 'chart.js';
import type { PeriodoData, ZonaData } from '@/features/subscriptions/types';
import type { Context } from 'chartjs-plugin-datalabels';
import { getHorizontalBarOptions, getLineOptions, horizontalBarOptions } from '@/shared/charts';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters/number';

export function buildChurnData(periodos: PeriodoData[], labels: string[]): ChartData<'line'> {
  return { labels, datasets: [
    { label: 'Churn Neto %', data: periodos.map((p) => Number(p.churn_neto_pct.toFixed(2))), borderColor: CHART_PALETTE[4], borderWidth: 3, fill: false, tension: 0.35 },
    { label: 'Churn Bruto %', data: periodos.map((p) => Number(p.churn_bruto_pct.toFixed(2))), borderColor: CHART_PALETTE[0], borderDash: [5, 5], borderWidth: 2.5, fill: false, tension: 0.35 },
  ] };
}

/**
 * Análisis de crecimiento: una columna es el crecimiento neto del mes, repartido
 * por dentro entre nuevos clientes y reactivaciones según lo que aporta cada uno
 * — apiladas suman exactamente ese crecimiento. El churn bruto va en su propia
 * columna, no apilado con ellas. La única cifra etiquetada es el total de la
 * pila (el crecimiento); el reparto se lee por altura y en el tooltip.
 */
export function buildGrowthData(periodos: PeriodoData[], labels: string[]): ChartData<'bar'> {
  const crecimiento = periodos.map((p) => (p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0));
  /** Parte del crecimiento que aporta cada origen, proporcional a sus altas. */
  const aporte = (i: number, origen: 'nuevos' | 'react') => {
    const p = periodos[i];
    const total = (p.nuevos_mes || 0) + (p.react_val || 0);
    const cuota = total > 0 ? (p.react_val || 0) / total : 0;
    return Number((crecimiento[i] * (origen === 'react' ? cuota : 1 - cuota)).toFixed(2));
  };

  return { labels, datasets: [
    { label: 'Nuevos Clientes', data: crecimiento.map((_, i) => aporte(i, 'nuevos')), backgroundColor: 'rgba(0, 255, 136, 0.85)', borderRadius: 6, stack: 'crecimiento', datalabels: { display: false } },
    // Última de la pila: es la que lleva la etiqueta con el total.
    { label: 'Reactivaciones', data: crecimiento.map((_, i) => aporte(i, 'react')), backgroundColor: 'rgba(37, 99, 235, 0.85)', borderRadius: 6, stack: 'crecimiento', datalabels: { ...TOTAL_PILA_LABEL, color: CHART_CHROME.textStrong } },
  ] };
}

/**
 * Etiqueta el total de la pila en vez del valor del segmento: se pone en el
 * último dataset de la pila y suma los de su mismo `stack`. `align` se calcula
 * porque una pila negativa crece hacia abajo y la etiqueta arriba caería dentro
 * de las barras.
 */
const TOTAL_PILA_LABEL = {
  display: 'auto' as const,
  anchor: 'end' as const,
  offset: 8,
  align: (ctx: Context) => (totalPila(ctx) < 0 ? 'bottom' : 'top') as 'bottom' | 'top',
  formatter: (_valor: number, ctx: Context) => `${formatTwoDecimals(totalPila(ctx))} %`,
};

function totalPila(ctx: Context): number {
  const { stack } = ctx.dataset as { stack?: string };
  return ctx.chart.data.datasets.reduce((suma, ds) => {
    if ((ds as { stack?: string }).stack !== stack) return suma;
    return suma + Number(ds.data[ctx.dataIndex] ?? 0);
  }, 0);
}

/** Escalas apiladas para `buildGrowthData`; el apilado se agrupa por `stack`. */
export const growthChartOptions: ChartOptions<'bar'> = getHorizontalBarOptions(undefined, ' %', 2, {
  scales: {
    ...horizontalBarOptions.scales,
    x: { ...horizontalBarOptions.scales?.x, stacked: true },
    y: { ...horizontalBarOptions.scales?.y, stacked: true },
  },
});

/**
 * Balanza de recuperaciones: la tasa de suspensión contra la de recuperación,
 * las dos sobre la misma base (los activos al inicio) para que se puedan
 * comparar en un solo eje. La recuperación se mide sobre los cortados
 * (`react_4_P / corte_impagado`), así que se reescala a la base: con un 40 % de
 * suspensión y un 80 % de recuperación, la línea marca 32 %. La tasa sobre los
 * cortados y los clientes de cada métrica van en el tooltip.
 *
 * Todo sale de los conteos y no de `tasa_winback_pct`: los meses analizados
 * antes del cambio de fórmula guardan ahí la definición vieja.
 */
function balanzaPeriodo(p: PeriodoData) {
  const base = p.activos_inicio || 0;
  const cortes = p.corte_impagado || 0;
  const recuperados = p.react_4_P || 0;
  return {
    cortes,
    recuperados,
    suspensionPct: base > 0 ? (cortes / base) * 100 : 0,
    recuperacionBasePct: base > 0 ? (recuperados / base) * 100 : 0,
    recuperacionPct: cortes > 0 ? (recuperados / cortes) * 100 : 0,
  };
}

export function buildBalanzaRecuperacionData(periodos: PeriodoData[], labels: string[]): ChartData<'line'> {
  const balanza = periodos.map(balanzaPeriodo);
  return { labels, datasets: [
    { label: 'Tasa de Suspensión %', data: balanza.map((b) => Number(b.suspensionPct.toFixed(2))), borderColor: CHART_PALETTE[0], backgroundColor: 'rgba(255, 42, 95, 0.2)', fill: true, tension: 0.35 },
    { label: 'Tasa de Recuperación %', data: balanza.map((b) => Number(b.recuperacionBasePct.toFixed(2))), borderColor: CHART_PALETTE[4], backgroundColor: 'rgba(0, 255, 136, 0.2)', fill: true, borderDash: [4, 4], tension: 0.35 },
  ] };
}

export function buildBalanzaRecuperacionOptions(periodos: PeriodoData[]): ChartOptions<'line'> {
  const base = getLineOptions(' %', 2);
  return {
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          label: (ctx) => {
            const b = balanzaPeriodo(periodos[ctx.dataIndex]);
            if (ctx.datasetIndex === 0) {
              return `Suspensión: ${formatTwoDecimals(b.suspensionPct)} % · ${formatInteger(b.cortes)} clientes cortados`;
            }
            return [
              `Recuperación: ${formatTwoDecimals(b.recuperacionPct)} % de los cortados · ${formatInteger(b.recuperados)} clientes`,
              `  equivale a ${formatTwoDecimals(b.recuperacionBasePct)} % de la base`,
            ];
          },
        },
      },
    },
  };
}

export function buildZoneDonut(labels: string[], values: number[], raw: Array<{ label: string; original: number }>): ChartData<'doughnut'> & { _raw: typeof raw } {
  return { labels, datasets: [{ data: values, backgroundColor: CHART_PALETTE.slice(0, labels.length), borderWidth: 2, borderColor: SURFACE.secondary }], _raw: raw };
}

export function aggregateZones(zones: ZonaData[], mode: 'churn' | 'growth') {
  const map: Record<string, { metric: number; activos: number; secondary: number; count: number }> = {};
  zones.forEach((zone) => {
    const key = zone.valor;
    map[key] ??= { metric: 0, activos: 0, secondary: 0, count: 0 };
    map[key].metric += Number(mode === 'churn' ? zone.churn_bruto_pct : zone.crecimiento || 0);
    map[key].activos += Number(zone.activos_inicio || 0);
    map[key].secondary += Number(mode === 'churn' ? zone.bajas : zone.nuevos);
    map[key].count += 1;
  });
  return Object.entries(map).map(([zona, value]) => ({ zona, metric: value.metric / Math.max(value.count, 1), activos: value.activos / Math.max(value.count, 1), secondary: value.secondary, count: value.count }));
}
