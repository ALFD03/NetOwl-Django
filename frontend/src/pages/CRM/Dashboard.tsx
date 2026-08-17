import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { Bar } from 'react-chartjs-2';
import { Clock } from 'lucide-react';

interface Props {
  totals: any;
  tiempoInstalacion: any;
  tiempoPorEtapa: any;
  efectividad: any[];
  etapa8: any;
  perdidos: any;
  rescate: any;
}

export default function CrmDashboard({
  totals = {},
  tiempoInstalacion = {},
  tiempoPorEtapa = {},
  efectividad = [],
  etapa8 = {},
  perdidos = {},
  rescate = {},
}: Props) {
  const horasPromedio = tiempoInstalacion.horas_promedio || 0;

  // Formatear etapas para gráfico de efectividad
  const efectividadChartData = {
    labels: efectividad.map((e: any) => e.etapa.replace('etapa_', 'Etapa ')),
    datasets: [
      {
        label: '% Efectividad',
        data: efectividad.map((e: any) => e.efectividad_pct),
        backgroundColor: '#10b981',
        borderRadius: 6,
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
    <AppLayout title="CRM Analytics Dashboard">
      <CrmHeader activeTab="dashboard" />

      {/* Indicador Promedio de Tiempo de Instalación */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 mb-6 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Clock className="w-4 h-4 text-brand" />
            <span>Tiempo Medio de Instalación</span>
          </div>
          <div className="text-4xl font-extrabold text-white">
            {horasPromedio} <span className="text-sm text-slate-400 font-normal">horas</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400">Total Instalados</span>
          <p className="text-2xl font-bold text-emerald-400">{tiempoInstalacion.total_instalados || 0}</p>
        </div>
      </div>

      {/* Tarjetas KPI CRM */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Oportunidades"
          value={totals.total_clientes || 0}
          color="blue"
          subValue="Pipeline completo"
        />
        <MetricCard
          label="Ganados"
          value={totals.ganados || 0}
          color="green"
          subValue="Instalaciones completadas"
        />
        <MetricCard
          label="Prospectos Devueltos (Etapa 8)"
          value={`${etapa8.pct || 0}%`}
          color="yellow"
          subValue={`${etapa8.count_etapa8 || 0} devueltos`}
        />
        <MetricCard
          label="Rescate de Perdidos"
          value={`${rescate.pct_rescate || 0}%`}
          color="red"
          subValue={`${rescate.rescatados || 0} rescatados`}
        />
      </div>

      {/* Gráfico de Efectividad */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-4">Efectividad por Etapa del Pipeline</h3>
        <div className="h-80">
          <Bar data={efectividadChartData} options={chartOptions} />
        </div>
      </div>
    </AppLayout>
  );
}