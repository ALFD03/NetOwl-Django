import { SURFACE } from '@/shared/constants/theme';
import type { ChartData } from 'chart.js';
import type { PeriodoData, ZonaData } from '@/features/subscriptions/types';
import { CHART_PALETTE } from '@/shared/constants/theme';

export function buildChurnData(periodos: PeriodoData[], labels: string[]): ChartData<'line'> {
  return { labels, datasets: [
    { label: 'Churn Neto %', data: periodos.map((p) => Number(p.churn_neto_pct.toFixed(2))), borderColor: '#00ff88', borderWidth: 3, fill: false, tension: 0.35 },
    { label: 'Churn Bruto %', data: periodos.map((p) => Number(p.churn_bruto_pct.toFixed(2))), borderColor: '#ff2a5f', borderDash: [5, 5], borderWidth: 2.5, fill: false, tension: 0.35 },
  ] };
}

export function buildGrowthData(periodos: PeriodoData[], labels: string[]): ChartData<'bar'> {
  const growth = periodos.map((p) => p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0);
  return { labels, datasets: [
    { label: 'Churn Bruto', data: periodos.map((p) => Number(-p.churn_bruto_pct.toFixed(2))), backgroundColor: 'rgba(255, 42, 95, 0.85)', borderRadius: 6 },
    { label: 'Reactivaciones', data: growth.map((value, i) => { const p = periodos[i]; const total = (p.nuevos_mes || 0) + (p.react_val || 0); return Number((value * (total > 0 ? p.react_val / total : 0)).toFixed(2)); }), backgroundColor: 'rgba(37, 99, 235, 0.85)', borderRadius: 6 },
    { label: 'Nuevos Clientes', data: growth.map((value, i) => { const p = periodos[i]; const total = (p.nuevos_mes || 0) + (p.react_val || 0); return Number((value * (total > 0 ? 1 - p.react_val / total : 1)).toFixed(2)); }), backgroundColor: 'rgba(0, 255, 136, 0.85)', borderRadius: 6 },
  ] };
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
