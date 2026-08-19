import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { ChartCard } from '@/components/UI/ChartCard';
import { Bar, Line } from 'react-chartjs-2';
import { Clock, TrendingUp, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { formatPeriodoLabel } from '@/utils/formatters';

interface Props {
  metrics: any;
  periods: string[];
  selectedPeriod: string;
}

export default function CrmDashboard({ metrics = {}, periods = [], selectedPeriod = '' }: Props) {
  const globalRes = metrics.resumen_global || {};
  const efectividad = metrics.efectividad || [];
  const historico = metrics.historico_tendencias || [];

  // Formato gráfico de efectividad
  const efectividadChartData = {
    labels: efectividad.map((e: any) => e.etapa.replace('etapa_', 'Etapa ').replace('_', ' ')),
    datasets: [
      {
        label: '% Efectividad',
        data: efectividad.map((e: any) => e.efectividad_pct),
        backgroundColor: '#10b981',
        borderRadius: 6,
      },
    ],
  };

  // Tendencia de cohortes históricas
  const tendenciaChartData = {
    labels: historico.map((h: any) => formatPeriodoLabel(h.periodo_reporte)),
    datasets: [
      {
        type: 'line' as const,
        label: '% Instalación',
        data: historico.map((h: any) => h.pct_instalacion),
        borderColor: '#10b981',
        borderWidth: 2.5,
        tension: 0.3,
      },
      {
        type: 'line' as const,
        label: '% Pérdida',
        data: historico.map((h: any) => h.pct_perdida),
        borderColor: '#f43f5e',
        borderWidth: 2.5,
        tension: 0.3,
      },
      {
        type: 'line' as const,
        label: '% Pendientes',
        data: historico.map((h: any) => h.pct_pendientes),
        borderColor: '#38bdf8',
        borderWidth: 2,
        borderDash: [4, 4],
        tension: 0.3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94a3b8' } },
      datalabels: { display: false },
    },
    scales: {
      x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8' } },
      y: { min: 0, max: 100, grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', callback: (v: any) => `${v}%` } },
    },
  };

  return (
    <AppLayout title="CRM Analytics Dashboard">
      <CrmHeader activeTab="dashboard" />

      {/* FILA 1: KPIs DE COHORTE COMERCIAL */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Oportunidades"
          value={globalRes.total_oportunidades_promedio || 0}
          color="blue"
          subValue="Creados en periodo"
        />
        <MetricCard
          label="% Instalación (Ganados)"
          value={`${globalRes.pct_instalacion_promedio || 0}%`}
          color="green"
          subValue={`Promedio: ${globalRes.ganados_promedio || 0} clientes`}
        />
        <MetricCard
          label="% Pérdida"
          value={`${globalRes.pct_perdida_promedio || 0}%`}
          color="red"
          subValue={`Promedio: ${globalRes.perdidos_promedio || 0} perdidos`}
        />
        <MetricCard
          label="% Pendientes"
          value={`${globalRes.pct_pendientes_promedio || 0}%`}
          color="yellow"
          subValue={`Promedio: ${globalRes.pendientes_promedio || 0} en curso`}
        />
      </div>

      {/* FILA 2: SLAS Y PROSPECTOS DEVUELTOS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Tiempo de Instalación */}
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Tiempo Medio Instalación
            </span>
            <span className="text-xs text-slate-500 font-mono">Ganados</span>
          </div>
          <div className="my-4">
            <span className="text-3xl font-extrabold text-white">{globalRes.horas_promedio_inst || 0}</span>
            <span className="text-xs text-slate-400 ml-1">horas</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Mediana: <strong>{globalRes.horas_mediana_inst || 0} h</strong> | % Excede Media: <strong>{globalRes.pct_excede_prom_inst || 0}%</strong>
            </p>
          </div>
        </div>

        {/* Tiempo de Pérdida */}
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-rose-400 uppercase flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Tiempo Medio a Pérdida
            </span>
            <span className="text-xs text-slate-500 font-mono">Perdidos</span>
          </div>
          <div className="my-4">
            <span className="text-3xl font-extrabold text-white">{globalRes.horas_promedio_perd || 0}</span>
            <span className="text-xs text-slate-400 ml-1">horas</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Mediana: <strong>{globalRes.horas_mediana_perd || 0} h</strong> | % Excede Media: <strong>{globalRes.pct_excede_prom_perd || 0}%</strong>
            </p>
          </div>
        </div>

        {/* Prospectos Devueltos (Etapa 8) */}
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-amber-400 uppercase flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Tasa Prospectos Devueltos
            </span>
            <span className="text-xs text-slate-500 font-mono">Etapa 8</span>
          </div>
          <div className="my-4">
            <span className="text-3xl font-extrabold text-amber-400">{globalRes.pct_devueltos_e8_promedio || 0}%</span>
            <p className="text-[11px] text-slate-400 mt-1">
              Promedio de <strong>{globalRes.count_devueltos_e8_promedio || 0}</strong> eventos de devolución por periodo.
            </p>
          </div>
        </div>
      </div>

      {/* FILA 3: GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Tendencia Histórica de Tasas (%)">
          <Line data={tendenciaChartData as any} options={chartOptions} />
        </ChartCard>

        <ChartCard title="Efectividad de Salida por Etapa (%)">
          <Bar data={efectividadChartData} options={chartOptions} />
        </ChartCard>
      </div>
    </AppLayout>
  );
}