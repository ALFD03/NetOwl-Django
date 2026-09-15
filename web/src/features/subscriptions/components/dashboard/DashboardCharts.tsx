/** Los gráficos de la portada: evolución del churn, crecimiento y reparto por zona. */

import { Activity, BarChart3, PieChart } from 'lucide-react';
import { NeonContainer } from '@/shared/ui';
import type { useSubscriptionDashboard } from '@/features/subscriptions/hooks/useSubscriptionDashboard';
import { BarChart, DoughnutChart, LineChart, defaultPlugins, getLineOptions, getHorizontalBarOptions } from '@/shared/charts';
import { growthChartOptions } from '@/features/subscriptions/charts/dashboardCharts';

interface DashboardChartsProps { data: ReturnType<typeof useSubscriptionDashboard> }
export function DashboardCharts({ data }: DashboardChartsProps) {
  return <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <NeonContainer theme="red" title="Evolución Churn Rate" subtitle="Neto vs Bruto Histórico" icon={<Activity className="w-5 h-5" />}><LineChart data={data.churnChartData} options={getLineOptions(' %', 2)} /></NeonContainer>
      <NeonContainer theme="green" title="Análisis de Crecimiento" subtitle="Crecimiento: Nuevos + Reactivaciones vs Churn" icon={<BarChart3 className="w-5 h-5" />}><BarChart data={data.growthChartData} options={growthChartOptions} /></NeonContainer>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <NeonContainer theme="blue" title="Comportamiento de Reactivaciones" subtitle="Aporte al crecimiento e índice de reemplazo" icon={<BarChart3 className="w-5 h-5" />}><BarChart data={data.aporteReemplazoData} options={getHorizontalBarOptions(undefined, ' %', 2)} /></NeonContainer>
      <NeonContainer theme="yellow" title="Balanza de Recuperaciones" subtitle="Suspensiones vs Reactivaciones de Pausa" icon={<Activity className="w-5 h-5" />}><LineChart data={data.suspensionWinbackData} options={getLineOptions()} /></NeonContainer>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <NeonContainer theme="red" title="Concentración % de Bajas por Zona" subtitle="Pasa el cursor para ver el Churn % de esa Zona" icon={<PieChart className="w-5 h-5" />}><DoughnutChart data={data.churnDonutData} options={data.churnDonutOptions} plugins={defaultPlugins}/></NeonContainer>
      <NeonContainer theme="green" title="Concentración % de Ventas por Zona" subtitle="Pasa el cursor para ver el Crecimiento % de esa Zona" icon={<PieChart className="w-5 h-5" />}><DoughnutChart data={data.growthDonutData} options={data.growthDonutOptions} plugins={defaultPlugins} /></NeonContainer>
    </div>
  </>;
}
