import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { Modal } from '@/components/UI/Modal';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PeriodoData {
  periodo_reporte: string;
  activos_inicio: number;
  activos_final: number;
  nuevos_mes: number;
  bajas: number;
  churn_neto_pct: number;
  churn_bruto_pct: number;
  reactivaciones: number;
  tasa_winback_pct: number;
  arpu: number;
  corte_impagado: number;
  porcentaje_suspensiones: number;
  adiciones_netas: number;
  adiciones_brutas: number;
}

interface Props {
  periodos: PeriodoData[];
}

export default function SubscriptionsDashboard({ periodos = [] }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodoData | null>(null);

  const latest = periodos[0] || {
    churn_neto_pct: 0,
    churn_bruto_pct: 0,
    activos_final: 0,
    arpu: 0,
    reactivaciones: 0,
    tasa_winback_pct: 0,
    adiciones_netas: 0,
  };

  const labels = [...periodos].map((p) => p.periodo_reporte).reverse();

  // Opciones base de gráficos
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
    },
    scales: {
      x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
      y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
    },
  };

  // Datos para Gráfico Churn
  const churnChartData = {
    labels,
    datasets: [
      {
        label: 'Churn Neto %',
        data: [...periodos].map((p) => p.churn_neto_pct).reverse(),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Churn Bruto %',
        data: [...periodos].map((p) => p.churn_bruto_pct).reverse(),
        borderColor: '#ef4444',
        borderDash: [4, 4],
        tension: 0.3,
      },
    ],
  };

  // Datos para Gráfico Adiciones Netas vs Brutas
  const adicionesChartData = {
    labels,
    datasets: [
      {
        label: 'Adiciones Netas',
        data: [...periodos].map((p) => p.adiciones_netas).reverse(),
        backgroundColor: '#10b981',
        borderRadius: 6,
      },
      {
        label: 'Adiciones Brutas',
        data: [...periodos].map((p) => p.adiciones_brutas).reverse(),
        backgroundColor: '#3b82f6',
        borderRadius: 6,
      },
    ],
  };

  return (
    <AppLayout title="Subscriptions Analytics">
      {/* Navegación por pestañas del módulo */}
      <SubHeader activeTab="dashboard" />

      {/* Tarjetas KPI Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Churn Rate Neto"
          value={`${latest.churn_neto_pct}%`}
          color="blue"
          subValue="Último periodo cerrado"
        />
        <MetricCard
          label="Churn Rate Bruto"
          value={`${latest.churn_bruto_pct}%`}
          color="red"
          subValue="Sin adiciones"
        />
        <MetricCard
          label="Suscriptores Activos"
          value={latest.activos_final.toLocaleString()}
          color="green"
          subValue="Total al cierre"
        />
        <MetricCard
          label="ARPU Promedio"
          value={`$${latest.arpu}`}
          color="yellow"
          subValue="Ingreso medio por suscriptor"
        />
      </div>

      {/* Gráficos Principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">Evolución Churn Rate Neto vs Bruto</h3>
          <div className="h-72">
            <Line data={churnChartData} options={chartOptions} />
          </div>
        </div>

        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">Adiciones Netas vs Brutas</h3>
          <div className="h-72">
            <Bar data={adicionesChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Tabla Resumen Interactiva */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Resumen por Periodo</h3>
          <span className="text-xs text-slate-400">Haz clic en una fila para ver el detalle</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-tertiary text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">Periodo</th>
                <th className="p-3.5 text-right">Inicio</th>
                <th className="p-3.5 text-right">Final</th>
                <th className="p-3.5 text-right">Nuevos</th>
                <th className="p-3.5 text-right">Bajas</th>
                <th className="p-3.5 text-right">Churn Neto</th>
                <th className="p-3.5 text-right">Churn Bruto</th>
                <th className="p-3.5 text-right">ARPU</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {periodos.map((p) => (
                <tr
                  key={p.periodo_reporte}
                  onClick={() => setSelectedPeriod(p)}
                  className="hover:bg-surface-hover cursor-pointer transition-colors"
                >
                  <td className="p-3.5 font-bold text-white">{p.periodo_reporte}</td>
                  <td className="p-3.5 text-right">{p.activos_inicio.toLocaleString()}</td>
                  <td className="p-3.5 text-right">{p.activos_final.toLocaleString()}</td>
                  <td className="p-3.5 text-right text-emerald-400 font-medium">+{p.nuevos_mes}</td>
                  <td className="p-3.5 text-right text-rose-400 font-medium">-{p.bajas}</td>
                  <td className="p-3.5 text-right font-semibold text-blue-400">{p.churn_neto_pct}%</td>
                  <td className="p-3.5 text-right font-semibold text-rose-400">{p.churn_bruto_pct}%</td>
                  <td className="p-3.5 text-right text-amber-400 font-medium">${p.arpu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle de Periodo */}
      <Modal
        isOpen={!!selectedPeriod}
        onClose={() => setSelectedPeriod(null)}
        title={`Detalle Periodo: ${selectedPeriod?.periodo_reporte || ''}`}
        size="lg"
      >
        {selectedPeriod && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-slate-400">Activos Inicio</p>
              <p className="text-base font-bold text-white mt-1">{selectedPeriod.activos_inicio}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-slate-400">Activos Cierre</p>
              <p className="text-base font-bold text-emerald-400 mt-1">{selectedPeriod.activos_final}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-slate-400">Nuevas Adiciones</p>
              <p className="text-base font-bold text-blue-400 mt-1">+{selectedPeriod.nuevos_mes}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-slate-400">Total Bajas</p>
              <p className="text-base font-bold text-rose-400 mt-1">-{selectedPeriod.bajas}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-slate-400">Reactivaciones</p>
              <p className="text-base font-bold text-amber-400 mt-1">{selectedPeriod.reactivaciones}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-slate-400">% Suspensiones</p>
              <p className="text-base font-bold text-purple-400 mt-1">{selectedPeriod.porcentaje_suspensiones}%</p>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}