/** Las tarjetas de la portada: churn, crecimiento, ARPU y tasa de recuperación promedio. */

import { Activity, AlertTriangle, DollarSign, RefreshCw, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import { MetricCard } from '@/shared/ui';
import { churnTone, growthTone } from '../../lib/targets';
import type { TargetsTrafficLight } from '../../types';

interface DashboardMetricsProps { data: { avgNetChurn:number; avgGrossChurn:number; avgGrowth:number; avgContributionRate:number; avgReplacementIndex:number; avgSuspensions:number; avgWinback:number; latest:{arpu:number}; thresholds: TargetsTrafficLight } }
export function DashboardMetrics({ data }: DashboardMetricsProps) {
  const { thresholds } = data;
  return <>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <MetricCard label="Churn Rate Neto Promedio" value={`${data.avgNetChurn.toFixed(2)}%`} color={churnTone(data.avgNetChurn, thresholds)} subValue="Promedio global" icon={<TrendingDown className="w-4 h-4 text-emerald-400" />} />
      <MetricCard label="Churn Rate Bruto Promedio" value={`${data.avgGrossChurn.toFixed(2)}%`} color={churnTone(data.avgGrossChurn, thresholds)} subValue="Promedio global" icon={<AlertTriangle className="w-4 h-4 text-rose-400" />} />
      <MetricCard label="Crecimiento Promedio" value={`${data.avgGrowth.toFixed(2)}%`} color={growthTone(data.avgGrowth, thresholds)} subValue="Crecimiento neto" icon={<TrendingUp className="w-4 h-4 text-sky-400" />} />
      <MetricCard label="ARPU Promedio" value={`$${data.latest.arpu}`} color="yellow" subValue="Ingreso medio mensual" icon={<DollarSign className="w-4 h-4 text-amber-400" />} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <MetricCard label="Tasa Aporte Reactivaciones" value={`${data.avgContributionRate.toFixed(2)}%`} color="blue" subValue="Peso en adiciones" icon={<RefreshCw className="w-4 h-4 text-sky-400" />} />
      <MetricCard label="Índice Reemplazo Bajas" value={`${data.avgReplacementIndex.toFixed(2)}%`} color="green" subValue="Cobertura sobre churn" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />} />
      <MetricCard label="Porcentaje Suspensiones" value={`${data.avgSuspensions.toFixed(2)}%`} color="red" subValue="Corte por impago" icon={<AlertTriangle className="w-4 h-4 text-rose-400" />} />
      <MetricCard label="Tasa de Recuperación Promedio" value={`${data.avgWinback.toFixed(2)}%`} color="yellow" subValue="Recuperados / Cortes por impago" icon={<Activity className="w-4 h-4 text-amber-400" />} />
    </div>
  </>;
}
