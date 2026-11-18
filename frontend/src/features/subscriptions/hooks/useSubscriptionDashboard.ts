/**
 * Estado y series del dashboard de suscripciones.
 *
 * Calcula las medias de todos los periodos y arma los datos de los tres gráficos
 * de la portada.
 */

import { CHART_PALETTE } from '@/shared/constants/theme';
import { useMemo, useState } from 'react';
import { formatPeriodLabel } from '@/shared/utils';
import { getDoughnutOptions, handleHover, type DoughnutHoverValue } from '@/shared/charts';
import { buildRecoveryBalanceData, buildRecoveryBalanceOptions, buildChurnData, buildGrowthData, buildZoneDonut } from '@/features/subscriptions/charts/dashboardCharts';
import type { SubscriptionDashboardProps } from '@/features/subscriptions/types';
import { useTargets } from '@/features/subscriptions/hooks/useTargets';

export function useSubscriptionDashboard({ closings, dimensions = {} }: SubscriptionDashboardProps) {
  const [hoveredChurnZone, setHoveredChurnZone] = useState<DoughnutHoverValue | null>(null);
  const [hoveredGrowthZone, setHoveredGrowthZone] = useState<DoughnutHoverValue | null>(null);
  const reversed = useMemo(() => [...closings].reverse(), [closings]);
  const labels = useMemo(() => reversed.map((p) => formatPeriodLabel(p.report_period)), [reversed]);
  const latest = closings[0] ?? { arpu: 0, active_start: 1, active_end: 1, churned: 0, new_in_month: 0, net_churn_pct: 0, gross_churn_pct: 0, react_4_P: 0, react_val: 0, winback_rate_pct: 0, react_contribution_pct: 0, react_replacement_pct: 0, suspension_pct: 0, unpaid_cuts: 0, reactivations: 0 };
  const average = (selector: (p: typeof latest) => number) => closings.length ? closings.reduce((sum, p) => sum + (selector(p) || 0), 0) / closings.length : 0;
  const avgNetChurn = average((p) => p.net_churn_pct);
  const avgGrossChurn = average((p) => p.gross_churn_pct);
  const avgGrowth = average((p) => p.active_start > 0 ? ((p.active_end - p.active_start) / p.active_start) * 100 : 0);
  const avgContributionRate = average((p) => p.react_contribution_pct);
  const avgReplacementIndex = average((p) => p.react_replacement_pct);
  const avgSuspensions = average((p) => p.suspension_pct);
  const avgWinback = average((p) => p.winback_rate_pct);

  // El semáforo tiene umbrales fijos: los promedios se pintan igual que
  // cualquier otro churn o crecimiento del módulo.
  const { thresholds } = useTargets();

  const churnRaw = useMemo(() => (dimensions.zona ?? []).map((z) => ({ label: z.value, original: z.gross_churn_pct })), [dimensions.zona]);
  const growthRaw = useMemo(() => (dimensions.zona ?? []).map((z) => ({ label: z.value, original: z.growth })), [dimensions.zona]);
  const churnValues = useMemo(() => {
    const grouped = new Map<string, { churn: number; active: number; churned: number; count: number }>();
    (dimensions.zona ?? []).forEach((z) => { const v = grouped.get(z.value) ?? { churn: 0, active: 0, churned: 0, count: 0 }; v.churn += z.gross_churn_pct || 0; v.active += z.active_start || 0; v.churned += z.churned || 0; v.count += 1; grouped.set(z.value, v); });
    const totalActive = latest.active_start || 1;
    return [...grouped.entries()].map(([zone, v]) => ({ zona: zone, share: ((v.churn / Math.max(v.count, 1)) / Math.max(latest.gross_churn_pct || 1, 1)) * ((v.active / Math.max(v.count, 1)) / totalActive) * 100, churn: v.churn / Math.max(v.count, 1) })).sort((a,b) => b.share-a.share);
  }, [dimensions.zona, latest.active_start, latest.gross_churn_pct]);
  const growthValues = useMemo(() => {
    const grouped = new Map<string, { growth: number; new_subs: number; count: number }>();
    (dimensions.zona ?? []).forEach((z) => { const v = grouped.get(z.value) ?? { growth: 0, new_subs: 0, count: 0 }; v.growth += z.growth || 0; v.new_subs += z.new_subs || 0; v.count += 1; grouped.set(z.value, v); });
    const total = [...grouped.values()].reduce((sum, v) => sum + v.new_subs, 0);
    return [...grouped.entries()].map(([zone, v]) => ({ zona: zone, growth: v.growth / Math.max(v.count, 1), share: total ? (v.new_subs / total) * 100 : 0 })).sort((a,b) => b.share-a.share);
  }, [dimensions.zona]);
  const churnMajor = churnValues.filter((z) => z.share >= 2.5);
  const churnOther = churnValues.filter((z) => z.share < 2.5).reduce((sum,z) => sum + z.share, 0);
  const growthMajor = growthValues.filter((z) => z.share >= 2.5);
  const growthOther = growthValues.filter((z) => z.share < 2.5).reduce((sum,z) => sum + z.share, 0);
  const churnDonutData = useMemo(() => { const labels = [...churnMajor.map(z=>z.zona), ...(churnOther > 0 ? ['Otras Zonas (<2.5%)'] : [])]; const values = [...churnMajor.map(z=>Number(z.share.toFixed(2))), ...(churnOther > 0 ? [Number(churnOther.toFixed(2))] : [])]; return buildZoneDonut(labels, values, [...churnRaw, {label:'Otras Zonas (<2.5%)', original:0}]); }, [churnMajor, churnOther, churnRaw]);
  const growthDonutData = useMemo(() => { const labels = [...growthMajor.map(z=>z.zona), ...(growthOther > 0 ? ['Otras Zonas (<2.5%)'] : [])]; const values = [...growthMajor.map(z=>Number(z.share.toFixed(2))), ...(growthOther > 0 ? [Number(growthOther.toFixed(2))] : [])]; return buildZoneDonut(labels, values, [...growthRaw, {label:'Otras Zonas (<2.5%)', original:0}]); }, [growthMajor, growthOther, growthRaw]);
  const churnDonutOptions = useMemo(() => getDoughnutOptions({ title: hoveredChurnZone ? `Churn ${hoveredChurnZone.name}` : 'Churn Bruto Prom.', value: hoveredChurnZone?.val ?? `${avgGrossChurn.toFixed(2)}%`, color: CHART_PALETTE[0] }, handleHover(setHoveredChurnZone, churnDonutData), { valueSuffix: ' %' }), [hoveredChurnZone, avgGrossChurn, churnDonutData]);
  const growthDonutOptions = useMemo(() => getDoughnutOptions({ title: hoveredGrowthZone ? `Crec. ${hoveredGrowthZone.name}` : 'Crec. Prom. Global', value: hoveredGrowthZone?.val ?? `${avgGrowth > 0 ? '+' : ''}${avgGrowth.toFixed(2)}%`, color: CHART_PALETTE[4] }, handleHover(setHoveredGrowthZone, growthDonutData), { valueSuffix: ' %' }), [hoveredGrowthZone, avgGrowth, growthDonutData]);

  const replacementContributionData = { labels, datasets: [
    { label: 'Tasa Aporte Reactivación %', data: reversed.map((p) => Number(p.react_contribution_pct.toFixed(2)) || 0), backgroundColor: 'rgba(37, 99, 235, 0.85)', borderRadius: 6 },
    { label: 'Índice Reemplazo %', data: reversed.map((p) => Number(p.react_replacement_pct.toFixed(2)) || 0), backgroundColor: 'rgba(0, 255, 136, 0.85)', borderRadius: 6 },
  ] };
  const suspensionWinbackData = useMemo(() => buildRecoveryBalanceData(reversed, labels), [reversed, labels]);
  const suspensionWinbackOptions = useMemo(() => buildRecoveryBalanceOptions(reversed), [reversed]);
  return { latest, thresholds, avgNetChurn, avgGrossChurn, avgGrowth, avgContributionRate, avgReplacementIndex, avgSuspensions, avgWinback, labels, reversed, churnChartData: buildChurnData(reversed, labels), growthChartData: buildGrowthData(reversed, labels), replacementContributionData, suspensionWinbackData, suspensionWinbackOptions, churnDonutData, growthDonutData, churnDonutOptions, growthDonutOptions };
}
