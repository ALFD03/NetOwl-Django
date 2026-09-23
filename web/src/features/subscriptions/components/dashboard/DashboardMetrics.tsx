/** Las tarjetas de la portada: churn, crecimiento, ARPU y winback promedio. */

import { Activity, AlertTriangle, DollarSign, RefreshCw, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import { MetricCard } from '@/shared/ui';
import { formatObjetivo, tonoChurn, tonoCrecimiento, type Objetivo } from '../../lib/objetivos';
import type { SemaforoObjetivos } from '../../types';

interface DashboardMetricsProps { data: { avgChurnNeto:number; avgChurnBruto:number; avgCrecimiento:number; avgTasaAporte:number; avgIndiceReemplazo:number; avgSuspensiones:number; avgWinback:number; latest:{arpu:number}; objetivoPromedio: Objetivo; semaforo: SemaforoObjetivos } }
export function DashboardMetrics({ data }: DashboardMetricsProps) {
  const { objetivoPromedio: objetivo, semaforo } = data;
  return <>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <MetricCard label="Churn Rate Neto Promedio" value={`${data.avgChurnNeto.toFixed(2)}%`} color={tonoChurn(data.avgChurnNeto, objetivo.churn, semaforo)} subValue={`Promedio global · objetivo ${formatObjetivo(objetivo.churn)}`} icon={<TrendingDown className="w-4 h-4 text-emerald-400" />} />
      <MetricCard label="Churn Rate Bruto Promedio" value={`${data.avgChurnBruto.toFixed(2)}%`} color={tonoChurn(data.avgChurnBruto, objetivo.churn, semaforo)} subValue={`Promedio global · objetivo ${formatObjetivo(objetivo.churn)}`} icon={<AlertTriangle className="w-4 h-4 text-rose-400" />} />
      <MetricCard label="Crecimiento Promedio" value={`${data.avgCrecimiento.toFixed(2)}%`} color={tonoCrecimiento(data.avgCrecimiento, objetivo.crecimiento, semaforo)} subValue={`Crecimiento neto · objetivo ${formatObjetivo(objetivo.crecimiento)}`} icon={<TrendingUp className="w-4 h-4 text-sky-400" />} />
      <MetricCard label="ARPU Promedio" value={`$${data.latest.arpu}`} color="yellow" subValue="Ingreso medio mensual" icon={<DollarSign className="w-4 h-4 text-amber-400" />} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <MetricCard label="Tasa Aporte Reactivaciones" value={`${data.avgTasaAporte.toFixed(2)}%`} color="blue" subValue="Peso en adiciones" icon={<RefreshCw className="w-4 h-4 text-sky-400" />} />
      <MetricCard label="Índice Reemplazo Bajas" value={`${data.avgIndiceReemplazo.toFixed(2)}%`} color="green" subValue="Cobertura sobre churn" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />} />
      <MetricCard label="Porcentaje Suspensiones" value={`${data.avgSuspensiones.toFixed(2)}%`} color="red" subValue="Corte por impago" icon={<AlertTriangle className="w-4 h-4 text-rose-400" />} />
      <MetricCard label="Tasa Winback Promedio" value={`${data.avgWinback.toFixed(2)}%`} color="yellow" subValue="Recuperados / Inactivos" icon={<Activity className="w-4 h-4 text-amber-400" />} />
    </div>
  </>;
}
