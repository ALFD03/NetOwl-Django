import { useMemo, useState } from 'react';
import { formatPeriodoLabel } from '@/shared/utils';
import { getDoughnutOptions, handleHover, type DoughnutHoverValue } from '@/shared/charts';
import { buildChurnData, buildGrowthData, buildZoneDonut } from '@/features/subscriptions/charts/dashboardCharts';
import type { SubscriptionDashboardProps } from '@/features/subscriptions/types';

export function useSubscriptionDashboard({ periodos, dimensiones = {} }: SubscriptionDashboardProps) {
  const [hoveredChurnZone, setHoveredChurnZone] = useState<DoughnutHoverValue | null>(null);
  const [hoveredCrecimientoZone, setHoveredCrecimientoZone] = useState<DoughnutHoverValue | null>(null);
  const reversed = useMemo(() => [...periodos].reverse(), [periodos]);
  const labels = useMemo(() => reversed.map((p) => formatPeriodoLabel(p.periodo_reporte)), [reversed]);
  const latest = periodos[0] ?? { arpu: 0, activos_inicio: 1, activos_final: 1, bajas: 0, nuevos_mes: 0, churn_neto_pct: 0, churn_bruto_pct: 0, react_4_P: 0, react_val: 0, tasa_winback_pct: 0, tasa_aporte_react_pct: 0, indice_reemplazo_react_pct: 0, porcentaje_suspensiones: 0, corte_impagado: 0, reactivaciones: 0 };
  const average = (selector: (p: typeof latest) => number) => periodos.length ? periodos.reduce((sum, p) => sum + (selector(p) || 0), 0) / periodos.length : 0;
  const avgChurnNeto = average((p) => p.churn_neto_pct);
  const avgChurnBruto = average((p) => p.churn_bruto_pct);
  const avgCrecimiento = average((p) => p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0);
  const avgTasaAporte = average((p) => p.tasa_aporte_react_pct);
  const avgIndiceReemplazo = average((p) => p.indice_reemplazo_react_pct);
  const avgSuspensiones = average((p) => p.porcentaje_suspensiones);
  const avgWinback = average((p) => p.tasa_winback_pct);

  const churnRaw = useMemo(() => (dimensiones.zona ?? []).map((z) => ({ label: z.valor, original: z.churn_bruto_pct })), [dimensiones.zona]);
  const growthRaw = useMemo(() => (dimensiones.zona ?? []).map((z) => ({ label: z.valor, original: z.crecimiento })), [dimensiones.zona]);
  const churnValues = useMemo(() => {
    const grouped = new Map<string, { churn: number; activos: number; bajas: number; count: number }>();
    (dimensiones.zona ?? []).forEach((z) => { const v = grouped.get(z.valor) ?? { churn: 0, activos: 0, bajas: 0, count: 0 }; v.churn += z.churn_bruto_pct || 0; v.activos += z.activos_inicio || 0; v.bajas += z.bajas || 0; v.count += 1; grouped.set(z.valor, v); });
    const totalActivos = latest.activos_inicio || 1;
    return [...grouped.entries()].map(([zona, v]) => ({ zona, share: ((v.churn / Math.max(v.count, 1)) / Math.max(latest.churn_bruto_pct || 1, 1)) * ((v.activos / Math.max(v.count, 1)) / totalActivos) * 100, churn: v.churn / Math.max(v.count, 1) })).sort((a,b) => b.share-a.share);
  }, [dimensiones.zona, latest.activos_inicio, latest.churn_bruto_pct]);
  const growthValues = useMemo(() => {
    const grouped = new Map<string, { growth: number; nuevos: number; count: number }>();
    (dimensiones.zona ?? []).forEach((z) => { const v = grouped.get(z.valor) ?? { growth: 0, nuevos: 0, count: 0 }; v.growth += z.crecimiento || 0; v.nuevos += z.nuevos || 0; v.count += 1; grouped.set(z.valor, v); });
    const total = [...grouped.values()].reduce((sum, v) => sum + v.nuevos, 0);
    return [...grouped.entries()].map(([zona, v]) => ({ zona, growth: v.growth / Math.max(v.count, 1), share: total ? (v.nuevos / total) * 100 : 0 })).sort((a,b) => b.share-a.share);
  }, [dimensiones.zona]);
  const churnMajor = churnValues.filter((z) => z.share >= 1);
  const churnOther = churnValues.filter((z) => z.share < 1).reduce((sum,z) => sum + z.share, 0);
  const growthMajor = growthValues.filter((z) => z.share >= 1);
  const growthOther = growthValues.filter((z) => z.share < 1).reduce((sum,z) => sum + z.share, 0);
  const churnDonutData = useMemo(() => { const labels = [...churnMajor.map(z=>z.zona), ...(churnOther > 0 ? ['Otras Zonas (<1.0%)'] : [])]; const values = [...churnMajor.map(z=>Number(z.share.toFixed(2))), ...(churnOther > 0 ? [Number(churnOther.toFixed(2))] : [])]; return buildZoneDonut(labels, values, [...churnRaw, {label:'Otras Zonas (<1.0%)', original:0}]); }, [churnMajor, churnOther, churnRaw]);
  const growthDonutData = useMemo(() => { const labels = [...growthMajor.map(z=>z.zona), ...(growthOther > 0 ? ['Otras Zonas (<1.0%)'] : [])]; const values = [...growthMajor.map(z=>Number(z.share.toFixed(2))), ...(growthOther > 0 ? [Number(growthOther.toFixed(2))] : [])]; return buildZoneDonut(labels, values, [...growthRaw, {label:'Otras Zonas (<1.0%)', original:0}]); }, [growthMajor, growthOther, growthRaw]);
  const churnDonutOptions = useMemo(() => getDoughnutOptions({ title: hoveredChurnZone ? `Churn ${hoveredChurnZone.name}` : 'Churn Bruto Prom.', value: hoveredChurnZone?.val ?? `${avgChurnBruto.toFixed(2)}%`, color: '#ff2a5f' }, handleHover(setHoveredChurnZone, churnDonutData)), [hoveredChurnZone, avgChurnBruto, churnDonutData]);
  const growthDonutOptions = useMemo(() => getDoughnutOptions({ title: hoveredCrecimientoZone ? `Crec. ${hoveredCrecimientoZone.name}` : 'Crec. Prom. Global', value: hoveredCrecimientoZone?.val ?? `${avgCrecimiento > 0 ? '+' : ''}${avgCrecimiento.toFixed(2)}%`, color: '#00ff88' }, handleHover(setHoveredCrecimientoZone, growthDonutData)), [hoveredCrecimientoZone, avgCrecimiento, growthDonutData]);

  const aporteReemplazoData = { labels, datasets: [
    { label: 'Tasa Aporte Reactivación %', data: reversed.map((p) => Number(p.tasa_aporte_react_pct.toFixed(2)) || 0), backgroundColor: 'rgba(37, 99, 235, 0.85)', borderRadius: 6 },
    { label: 'Índice Reemplazo %', data: reversed.map((p) => Number(p.indice_reemplazo_react_pct.toFixed(2)) || 0), backgroundColor: 'rgba(0, 255, 136, 0.85)', borderRadius: 6 },
  ] };
  const suspensionWinbackData = { labels, datasets: [
    { label: 'Suspensiones', data: reversed.map((p) => Number(p.corte_impagado) || 0), borderColor: '#ff2a5f', backgroundColor: 'rgba(255, 42, 95, 0.2)', fill: true, tension: 0.35 },
    { label: 'Recuperaciones', data: reversed.map((p) => Number(p.react_4_P) || 0), borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.2)', fill: true, borderDash: [4, 4], tension: 0.35 },
  ] };
  return { latest, avgChurnNeto, avgChurnBruto, avgCrecimiento, avgTasaAporte, avgIndiceReemplazo, avgSuspensiones, avgWinback, labels, reversed, churnChartData: buildChurnData(reversed, labels), growthChartData: buildGrowthData(reversed, labels), aporteReemplazoData, suspensionWinbackData, churnDonutData, growthDonutData, churnDonutOptions, growthDonutOptions };
}
