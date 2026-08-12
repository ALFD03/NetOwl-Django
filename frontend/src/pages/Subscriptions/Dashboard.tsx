import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { Modal } from '@/components/UI/Modal';
import { Line, Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
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
  BarController,
  LineController,
  layouts,
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
  Filler,
  BarController,
  LineController,
  ChartDataLabels
);

interface PeriodoData {
  periodo_reporte: string;
  activos_inicio: number;
  activos_final: number;
  nuevos_mes: number;
  bajas: number;
  churn_neto_pct: number;
  churn_bruto_pct: number;
  react_val: number;
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

const formatPeriodoLabel = (str: string) => {
  if (!str) return '';
  const match = str.match(/(\d{4})-(\d{2})/);
  if (!match) return str;

  const year = match[1];
  const monthNum = parseInt(match[2], 10);
  const monthNames = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];
  const monthName = monthNames[monthNum - 1] || match[2];
  return `${monthName} ${year}`;
};

export default function SubscriptionsDashboard({ periodos = [] }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodoData | null>(null);

  const latest = periodos[0] || { arpu: 0 };
  const totalPeriodos = periodos.length;

  // --- CÁLCULO DE PROMEDIOS GLOBALES ---
  const avgChurnNetoNum = totalPeriodos > 0
    ? periodos.reduce((acc, p) => acc + (p.churn_neto_pct || 0), 0) / totalPeriodos
    : 0;

  const avgChurnBrutoNum = totalPeriodos > 0
    ? periodos.reduce((acc, p) => acc + (p.churn_bruto_pct || 0), 0) / totalPeriodos
    : 0;

  const avgCrecimientoNum = totalPeriodos > 0
    ? periodos.reduce((acc, p) => {
        const crec = p.activos_inicio > 0 
          ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 
          : 0;
        return acc + crec;
      }, 0) / totalPeriodos
    : 0;

  const getChurnColor = (val: number): 'green' | 'yellow' | 'red' => {
    if (val < 3.0) return 'green';
    if (val < 4.0) return 'yellow';
    return 'red';
  };

  const getCrecimientoColor = (val: number): 'red' | 'yellow' | 'green' => {
    if (val < 0) return 'red';
    if (val < 2.0) return 'yellow';
    return 'green';
  };

  const labelsFormatted = [...periodos].map((p) => formatPeriodoLabel(p.periodo_reporte)).reverse();

  // --- OPCIONES GRÁFICO CHURN ---
  const churnChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: '#cbd5e1',
          font: { size: 11, weight: '500' },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
        },
      },
      datalabels: { display: false },
    },
    scales: {
      x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
      y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
    },
  };

  // --- OPCIONES GRÁFICO CRECIMIENTO (Aprovamiento total de espacio y sin error IDE) ---
  const crecimientoChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { top: 0, bottom: 0 },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: '#cbd5e1',
          font: { size: 11, weight: '500' },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 10
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const index = context.dataIndex;
            const rawIndex = periodos.length - 1 - index;
            const p = periodos[rawIndex];
            const label = context.dataset.label || '';
            const val = Math.abs(context.parsed.y || 0);

            if (label.includes('Churn Bruto')) {
              return `${label}: -${val.toFixed(2)}% (${p.bajas?.toLocaleString()} bajas)`;
            }
            if (label.includes('Reactivaciones')) {
              const totalEntradas = (p.nuevos_mes || 0) + (p.react_val || 0);
              const tasaAporte = totalEntradas > 0 ? (p.react_val / totalEntradas) * 100 : 0;
              return `${label}: +${val.toFixed(2)}% (${p.react_val?.toLocaleString()} reactivaciones - Aporte: ${tasaAporte.toFixed(1)}%)`;
            }
            if (label.includes('Nuevos')) {
              return `${label}: +${val.toFixed(2)}% (${p.nuevos_mes?.toLocaleString()} clientes nuevos)`;
            }
            return `${label}: ${val.toFixed(2)}%`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: false,
        grid: { color: 'rgba(30, 41, 59, 0.4)' },
        ticks: { color: '#94a3b8', font: { size: 10, weight: '500' } },
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { color: '#94a3b8', font: { size: 10 } },
        grace: '15%',
      },
    },
  };

  // --- GRADIENTE CHURN LÍNEA ---
  const createChurnGradient = (context: any) => {
    const chart = context.chart;
    const { ctx, chartArea } = chart;
    if (!chartArea) return '#00d2ff';

    const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
    const data = context.dataset.data;
    const totalPoints = data.length;

    data.forEach((val: number, index: number) => {
      const position = totalPoints > 1 ? index / (totalPoints - 1) : 0;
      let color = '#00ff88';
      if (val >= 4.0) color = '#ff2a5f';
      else if (val >= 3.0) color = '#ffb703';
      gradient.addColorStop(position, color);
    });

    return gradient;
  };

  // --- DATASETS CHURN ---
  const churnChartData = {
    labels: labelsFormatted,
    datasets: [
      {
        label: 'Churn Neto %',
        data: [...periodos].map((p) => p.churn_neto_pct).reverse(),
        borderColor: createChurnGradient,
        borderWidth: 3.5,
        fill: false,
        tension: 0.35,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: [...periodos].map((p) => {
          const val = p.churn_neto_pct;
          if (val >= 4.0) return '#ff2a5f';
          if (val >= 3.0) return '#ffb703';
          return '#00ff88';
        }).reverse(),
      },
      {
        label: 'Churn Bruto %',
        data: [...periodos].map((p) => p.churn_bruto_pct).reverse(),
        borderColor: '#ff2a5f',
        borderDash: [5, 5],
        borderWidth: 2.5,
        fill: false,
        tension: 0.35,
        pointRadius: 4,
      },
    ],
  };

  // --- DATASETS CRECIMIENTO (VALORES POR FUERA CON CLIP FALSE) ---
  const crecimientoChartData = {
    labels: labelsFormatted,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Churn Bruto',
        stack: 'loss',
        data: [...periodos].map((p) => -p.churn_bruto_pct).reverse(),
        backgroundColor: 'rgba(255, 42, 95, 0.85)',
        borderColor: '#ff2a5f',
        borderWidth: 1.5,
        borderRadius: 6,
        datalabels: {
          display: true,
          clip: false,
          anchor: 'end' as const,
          align: 'end' as const, // Posiciona en la punta exterior de la barra negativa
          offset: 4,
          color: '#ff2a5f',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number) => `-${Math.abs(val).toFixed(2)}%`,
        },
      },
      {
        type: 'bar' as const,
        label: 'Reactivaciones',
        stack: 'growth',
        data: [...periodos].map((p) => {
          const crec = p.activos_inicio > 0 
            ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 
            : 0;
          const totalEntradas = (p.nuevos_mes || 0) + (p.react_val || 0);
          const tasaAporte = totalEntradas > 0 ? (p.react_val / totalEntradas) : 0;
          return Number((crec * tasaAporte).toFixed(2));
        }).reverse(),
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        borderRadius: 6,
        datalabels: {
          display: false,
        },
      },
      {
        type: 'bar' as const,
        label: 'Nuevos Clientes',
        stack: 'growth',
        data: [...periodos].map((p) => {
          const crec = p.activos_inicio > 0 
            ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 
            : 0;
          const totalEntradas = (p.nuevos_mes || 0) + (p.react_val || 0);
          const tasaAporte = totalEntradas > 0 ? (p.react_val / totalEntradas) : 0;
          return Number((crec * (1 - tasaAporte)).toFixed(2));
        }).reverse(),
        backgroundColor: 'rgba(0, 255, 136, 0.85)',
        borderColor: '#00ff88',
        borderWidth: 1.5,
        borderRadius: 6,
        datalabels: {
          display: true,
          clip: false,
          anchor: 'end' as const,
          align: 'end' as const, // Posiciona en la punta exterior superior
          offset: 4,
          color: '#00ff88',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number, context: any) => {
            const index = context.dataIndex;
            const rawIndex = periodos.length - 1 - index;
            const p = periodos[rawIndex];
            const crecTotal = p.activos_inicio > 0 
              ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 
              : 0;
            return `${crecTotal > 0 ? '+' : ''}${crecTotal.toFixed(2)}%`;
          },
        },
      },
    ],
  };

  return (
    <AppLayout title="Subscriptions Analytics">
      <SubHeader activeTab="dashboard" />

      {/* Tarjetas KPI Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Churn Rate Neto Promedio"
          value={`${avgChurnNetoNum.toFixed(4)}%`}
          color={getChurnColor(avgChurnNetoNum)}
          subValue={`Promedio de ${totalPeriodos} periodos`}
        />
        <MetricCard
          label="Churn Rate Bruto Promedio"
          value={`${avgChurnBrutoNum.toFixed(4)}%`}
          color={getChurnColor(avgChurnBrutoNum)}
          subValue={`Promedio de ${totalPeriodos} periodos`}
        />
        <MetricCard
          label="Crecimiento Promedio"
          value={`${avgCrecimientoNum.toFixed(2)}%`}
          color={getCrecimientoColor(avgCrecimientoNum)}
          subValue="Variación neta promedio"
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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-white">Evolución Churn Rate (Neto vs Bruto)</h3>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">Reglas de Churn</span>
              <span className="flex items-center gap-1 text-[#00ff88]"><span className="w-2 h-2 rounded-full bg-[#00ff88]"></span>&lt;3.0%</span>
              <span className="flex items-center gap-1 text-[#ffb703]"><span className="w-2 h-2 rounded-full bg-[#ffb703]"></span>3.0-4.0%</span>
              <span className="flex items-center gap-1 text-[#ff2a5f]"><span className="w-2 h-2 rounded-full bg-[#ff2a5f]"></span>&gt;4.0%</span>
            </div>
          </div>
          <div className="h-72">
            <Line data={churnChartData} options={churnChartOptions} />
          </div>
        </div>

        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-white">Análisis de Crecimiento</h3>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">Reglas de Crecimiento</span>
              <span className="flex items-center gap-1 text-[#00ff88]"><span className="w-2 h-2 rounded-full bg-[#00ff88]"></span>&gt;2.0%</span>
              <span className="flex items-center gap-1 text-[#ffb703]"><span className="w-2 h-2 rounded-full bg-[#ffb703]"></span>0.0-2.0%</span>
              <span className="flex items-center gap-1 text-[#ff2a5f]"><span className="w-2 h-2 rounded-full bg-[#ff2a5f]"></span>&lt;0.0%</span>
            </div>
          </div>
          <div className="h-72">
            <Bar data={crecimientoChartData} options={crecimientoChartOptions} />
          </div>
        </div>
      </div>

      {/* Tabla Resumen */}
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

      {/* Modal de Detalle */}
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
              <p className="text-base font-bold text-amber-400 mt-1">{selectedPeriod.react_val}</p>
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