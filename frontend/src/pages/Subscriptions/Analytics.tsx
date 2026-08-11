import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { Bar } from 'react-chartjs-2';
import { Filter, Layers } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface DimensionVal {
  valor: string;
  activos_final: number;
  nuevos: number;
  bajas: number;
  churn_neto_pct: number;
}

interface DimensionGroup {
  periodo_reporte: string;
  dimensiones: Record<string, DimensionVal[]>;
}

interface Props {
  periodos: any[];
  dimensiones: DimensionGroup[];
}

export default function SubscriptionsAnalytics({ dimensiones = [] }: Props) {
  const [selectedDim, setSelectedDim] = useState<string>('zona');

  const latestDimGroup = dimensiones[0]?.dimensiones || {};
  const currentDimData = latestDimGroup[selectedDim] || [];

  const dimLabels = {
    zona: 'Zona',
    sucursal: 'Sucursal',
    municipio: 'Municipio',
    campanna: 'Campaña',
    producto: 'Producto',
  };

  const chartData = {
    labels: currentDimData.map((d) => d.valor),
    datasets: [
      {
        label: 'Activos Cierre',
        data: currentDimData.map((d) => d.activos_final),
        backgroundColor: '#3b82f6',
        borderRadius: 6,
      },
      {
        label: 'Nuevos',
        data: currentDimData.map((d) => d.nuevos),
        backgroundColor: '#10b981',
        borderRadius: 6,
      },
      {
        label: 'Bajas',
        data: currentDimData.map((d) => d.bajas),
        backgroundColor: '#ef4444',
        borderRadius: 6,
      },
    ],
  };

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

  return (
    <AppLayout title="Subscriptions Analytics">
      <SubHeader activeTab="analytics" />

      {/* Control de Dimensión */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Filter className="w-4 h-4 text-brand" />
          <span>Dimensiones de Análisis:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(dimLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedDim(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedDim === key
                  ? 'bg-brand text-white shadow-md shadow-brand/20'
                  : 'bg-surface-tertiary text-slate-400 hover:text-white hover:bg-surface-hover border border-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfico Dimensional */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl p-6 mb-6 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-4">
          Comparativa por {dimLabels[selectedDim as keyof typeof dimLabels] || selectedDim}
        </h3>
        <div className="h-80">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Tabla Desglosada */}
      <div className="bg-surface-secondary border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            Desglose Detallado: {dimLabels[selectedDim as keyof typeof dimLabels] || selectedDim}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-tertiary text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3.5">Valor / Etiqueta</th>
                <th className="p-3.5 text-right">Activos Cierre</th>
                <th className="p-3.5 text-right">Nuevos</th>
                <th className="p-3.5 text-right">Bajas</th>
                <th className="p-3.5 text-right">Churn Neto %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {currentDimData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">
                    No hay datos disponibles para esta dimensión.
                  </td>
                </tr>
              ) : (
                currentDimData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-surface-hover transition-colors">
                    <td className="p-3.5 font-bold text-white">{row.valor}</td>
                    <td className="p-3.5 text-right font-medium">{row.activos_final.toLocaleString()}</td>
                    <td className="p-3.5 text-right text-emerald-400">+{row.nuevos}</td>
                    <td className="p-3.5 text-right text-rose-400">-{row.bajas}</td>
                    <td className="p-3.5 text-right font-semibold text-brand">{row.churn_neto_pct}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}