import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { Chart, Line, Bar } from 'react-chartjs-2';
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
  react_4_P: number;
  react_val: number;
  tasa_winback_pct: number;
  tasa_aporte_react_pct: number;
  indice_reemplazo_react_pct: number;
  porcentaje_suspensiones: number;
  arpu: number;
  corte_impagado: number;
}

interface ZonaData {
  valor: string;
  bajas: number;
  nuevos: number;
  churn_bruto_pct: number;
  crecimiento: number;
}

interface Props {
  periodos: PeriodoData[];
  dimensiones?: Record<string, ZonaData[]>;
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

export default function SubscriptionsDashboard({ periodos = [], dimensiones = {} }: Props) {
  const latest = periodos[0] || { arpu: 0 };
  const totalPeriodos = periodos.length;

  // --- CÁLCULO DE PROMEDIOS DE TODAS LAS CARDS ---
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

  const avgTasaAporte = totalPeriodos > 0
    ? periodos.reduce((acc, p) => acc + (p.tasa_aporte_react_pct || 0), 0) / totalPeriodos
    : 0;

  const avgIndiceReemplazo = totalPeriodos > 0
    ? periodos.reduce((acc, p) => acc + (p.indice_reemplazo_react_pct || 0), 0) / totalPeriodos
    : 0;

  const avgSuspensiones = totalPeriodos > 0
    ? periodos.reduce((acc, p) => acc + (p.porcentaje_suspensiones || 0), 0) / totalPeriodos
    : 0;

  const avgWinback = totalPeriodos > 0
    ? periodos.reduce((acc, p) => acc + (p.tasa_winback_pct || 0), 0) / totalPeriodos
    : 0;

  // Helpers de color
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

  // --- DATOS ZONAS TOP ---
  const zonasList = dimensiones.zona || [];
  const topZonasChurn = [...zonasList].sort((a, b) => b.bajas - a.bajas).slice(0, 6);
  const topZonasCrecimiento = [...zonasList].sort((a, b) => b.nuevos - a.nuevos).slice(0, 6);

  // --- OPCIONES BASE GRÁFICOS DE LÍNEAS ---
  const baseLineOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: { color: '#cbd5e1', font: { size: 11 } },
      },
      datalabels: { display: false },
    },
    scales: {
      x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
      y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '5%' },
    },
  };

  // --- OPCIONES BARRAS ZONAS HORIZONTALES ---
  const horizontalBarOptions: any = {
    indexAxis: 'x' as const,
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
      datalabels: {
        anchor: 'end' as const,
        align: 'center' as const,
        font: { weight: 'bold' as const, size: 10 },
        formatter: (val: number) => val.toLocaleString(),
        offset: 4,
      },
    },
    scales: {
      x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
      y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '5%' },
    },
  };

  // 1. Churn Neto vs Bruto
  const churnChartData = {
    labels: labelsFormatted,
    datasets: [
      {
        type: 'line' as const,
        label: 'Churn Neto %',
        data: [...periodos].map((p) => p.churn_neto_pct).reverse(),
        borderColor: '#00ff88',
        borderWidth: 3,
        fill: false,
        tension: 0.35,
      },
      {
        type: 'line' as const,
        label: 'Churn Bruto %',
        data: [...periodos].map((p) => p.churn_bruto_pct).reverse(),
        borderColor: '#ff2a5f',
        borderDash: [5, 5],
        borderWidth: 2.5,
        fill: false,
        tension: 0.35,
      },
    ],
  };

  // 2. Crecimiento
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
          align: 'end' as const,
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
          const crec = p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0;
          const totalEntradas = (p.nuevos_mes || 0) + (p.react_val || 0);
          const tasaAporte = totalEntradas > 0 ? (p.react_val / totalEntradas) : 0;
          return Number((crec * tasaAporte).toFixed(2));
        }).reverse(),
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        borderRadius: 6,
        datalabels: { display: false },
      },
      {
        type: 'bar' as const,
        label: 'Nuevos Clientes',
        stack: 'growth',
        data: [...periodos].map((p) => {
          const crec = p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0;
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
          align: 'end' as const,
          offset: 4,
          color: '#00ff88',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number, context: any) => {
            const index = context.dataIndex;
            const rawIndex = periodos.length - 1 - index;
            const p = periodos[rawIndex];
            const crecTotal = p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0;
            return `${crecTotal > 0 ? '+' : ''}${crecTotal.toFixed(2)}%`;
          },
        },
      },
    ],
  };

  // 3. Tasa de Aporte vs Índice de Reemplazo
  const aporteReemplazoData = {
    labels: labelsFormatted,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Tasa Aporte Reactivación %',
        data: [...periodos].map((p) => p.tasa_aporte_react_pct || 0).reverse(),
        // borderColor: '#3b82f6',
        backgroundColor: '#3b82f6',
        borderWidth: 1.5,
        borderRadius: 6,
        datalabels: {
          display: true,
          clip: false,
          anchor: 'end' as const,
          align: 'end' as const,
          offset: 4,
          color: '#3b82f6',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number) => `${val.toFixed(2)}%`,
        },
      },
      {
        type: 'bar' as const,
        label: 'Índice Reemplazo %',
        data: [...periodos].map((p) => p.indice_reemplazo_react_pct || 0).reverse(),
        // borderColor: '#10b981',
        backgroundColor: '#10b981',
        borderWidth: 1.5,
        borderRadius: 6,
        datalabels: {
          display: true,
          clip: false,
          anchor: 'end' as const,
          align: 'end' as const,
          offset: 4,
          color: '#10b981',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number) => `${val.toFixed(2)}%`,
        },
      },
    ],
  };

  // 4. Suspensiones vs Winback
  const suspensionWinbackData = {
    labels: labelsFormatted,
    datasets: [
      {
        label: '% Suspensiones',
        data: [...periodos].map((p) => p.corte_impagado|| 0).reverse(),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        fill: true,
        tension: 0.35,
      },
      {
        label: 'Tasa Winback %',
        data: [...periodos].map((p) => p.react_4_P || 0).reverse(),
        borderColor: '#13f50b',
        backgroundColor: '#13f50b33',
        borderDash: [4, 4],
        fill: true,
        tension: 0.35,
      },
    ],
  };

  // 5. Top Zonas Churn Bruto
  const zonasChurnData = {
    labels: topZonasChurn.map((z) => z.valor),
    datasets: [
      {
        label: 'Bajas por Zona',
        data: topZonasChurn.map((z) => z.bajas),
        backgroundColor: 'rgba(255, 42, 95, 0.85)',
        borderColor: '#ff2a5f',
        borderRadius: 6,
      },
    ],
  };

  // 6. Top Zonas Crecimiento
  const zonasCrecimientoData = {
    labels: topZonasCrecimiento.map((z) => z.valor),
    datasets: [
      {
        label: 'Nuevos por Zona',
        data: topZonasCrecimiento.map((z) => z.nuevos),
        backgroundColor: 'rgba(0, 255, 136, 0.85)',
        borderColor: '#00ff88',
        borderRadius: 6,
      },
    ],
  };

  return (
    <AppLayout title="Subscriptions Analytics">
      <SubHeader activeTab="dashboard" />

      {/* FILA 1: TARJETAS KPI PRINCIPALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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

      {/* FILA 2: NUEVAS TARJETAS KPI SOLICITADAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Tasa Aporte Reactivaciones"
          value={`${avgTasaAporte.toFixed(2)}%`}
          color="blue"
          subValue="Peso de reactivados en ingresos"
        />
        <MetricCard
          label="Índice Reemplazo Bajas"
          value={`${avgIndiceReemplazo.toFixed(2)}%`}
          color="green"
          subValue="Cobertura winback de bajas"
        />
        <MetricCard
          label="Porcentaje Suspensiones"
          value={`${avgSuspensiones.toFixed(2)}%`}
          color="red"
          subValue="Corte impago / Activos inicio"
        />
        <MetricCard
          label="Tasa Winback Promedio"
          value={`${avgWinback.toFixed(2)}%`}
          color="yellow"
          subValue="Recuperación sobre inactivos"
        />
      </div>

      {/* FILA DE GRÁFICOS 1: CHURN Y CRECIMIENTO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-3">Evolución Churn Rate</h3>
          <div className="h-72">
            <Line data={churnChartData} options={baseLineOptions} />
          </div>
        </div>

        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-3">Análisis de Crecimiento</h3>
          <div className="h-72">
            <Bar data={crecimientoChartData} options={horizontalBarOptions} />
          </div>
        </div>
      </div>

      {/* FILA DE GRÁFICOS 2: APORTE VS REEMPLAZO Y SUSPENSIONES VS WINBACK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-3">Tasa de Aporte vs Índice de Reemplazo</h3>
          <div className="h-72">
            <Bar data={aporteReemplazoData} options={horizontalBarOptions} />
          </div>
        </div>

        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-3">Porcentaje Suspensiones vs Tasa Winback</h3>
          <div className="h-72">
            <Line data={suspensionWinbackData} options={baseLineOptions} />
          </div>
        </div>
      </div>

      {/* FILA DE GRÁFICOS 3: TOP ZONAS APORTE A CHURN Y CRECIMIENTO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-3">Top Zonas - Aporte al Churn Rate Bruto (Bajas)</h3>
          <div className="h-72">
            <Bar data={zonasChurnData} options={horizontalBarOptions} />
          </div>
        </div>

        <div className="bg-surface-secondary border border-slate-800 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-3">Top Zonas - Aporte al Crecimiento (Nuevos)</h3>
          <div className="h-72">
            <Bar data={zonasCrecimientoData} options={horizontalBarOptions} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}