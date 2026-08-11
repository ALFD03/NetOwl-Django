import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { Line } from 'react-chartjs-2';

interface Props {
  lifecycle: any;
  dimensiones: any;
}

export default function SubscriptionsLifetime({ lifecycle = {} }: Props) {
  const curvaActivo = lifecycle.curva_activo || [];

  const chartData = {
    labels: curvaActivo.map((p: any) => `${p.tiempo}d`),
    datasets: [
      {
        label: 'Supervivencia (Días Activos)',
        data: curvaActivo.map((p: any) => p.sup * 100),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94a3b8' } },
    },
    scales: {
      x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8' } },
      y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8' } },
    },
  };

  return (
    <AppLayout title="Life Time Cycle (Kaplan-Meier)">
      <SubHeader activeTab="lifetime" />

      {/* Métricas KPI de Ciclo de Vida */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Mediana Días Activo"
          value={lifecycle.mediana_activo ? `${lifecycle.mediana_activo} d` : 'N/A'}
          color="blue"
          subValue="50% de probabilidad de permanencia"
        />
        <MetricCard
          label="Promedio Días Activo"
          value={lifecycle.promedio_activo ? `${lifecycle.promedio_activo} d` : 'N/A'}
          color="green"
          subValue="Permanencia promedio global"
        />
        <MetricCard
          label="Suscriptores Analizados"
          value={lifecycle.total_suscriptores || 0}
          color="yellow"
          subValue="Población muestreada"
        />
        <MetricCard
          label="Tasa de Censura"
          value={lifecycle.tasa_censura ? `${(lifecycle.tasa_censura * 100).toFixed(1)}%` : 'N/A'}
          color="red"
          subValue="Permanecen activos sin baja"
        />
      </div>

      {/* Gráfico de Curva Kaplan-Meier */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-4">Curva de Permanencia Kaplan-Meier</h3>
        <div className="h-80">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </AppLayout>
  );
}