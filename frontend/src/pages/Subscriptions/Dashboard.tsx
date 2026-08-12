import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { ChartCard } from '@/components/UI/ChartCard';
import { formatPeriodoLabel, getChurnColor, getCrecimientoColor, PALETTE } from '@/utils/formatters';
import { centerTextPlugin } from '@/components/Charts/plugins';
import { baseLineOptions, horizontalBarOptions } from '@/components/Charts/chartOptions';
import { Chart, Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
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
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  BarController,
  LineController
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
  reactivaciones: number;
}

interface ZonaData {
  valor: string;
  bajas: number;
  nuevos: number;
  activos_final: number;
  churn_bruto_pct: number;
  crecimiento: number;
}

interface Props {
  periodos: PeriodoData[];
  dimensiones?: Record<string, ZonaData[]>;
}

export default function SubscriptionsDashboard({ periodos = [], dimensiones = {} }: Props) {
  const [hoveredChurnZone, setHoveredChurnZone] = React.useState<{ name: string; churnPct: number } | null>(null);
  const [hoveredCrecimientoZone, setHoveredCrecimientoZone] = React.useState<{ name: string; crecimientoPct: number } | null>(null);

  const latest = periodos[0] || { arpu: 0, bajas: 1, nuevos_mes: 1, activos_final: 1 };
  const totalPeriodos = periodos.length;

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

  const avgTasaAporte = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.tasa_aporte_react_pct || 0), 0) / totalPeriodos : 0;
  const avgIndiceReemplazo = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.indice_reemplazo_react_pct || 0), 0) / totalPeriodos : 0;
  const avgSuspensiones = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.porcentaje_suspensiones || 0), 0) / totalPeriodos : 0;
  const avgWinback = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.tasa_winback_pct || 0), 0) / totalPeriodos : 0;

  const labelsFormatted = [...periodos].map((p) => formatPeriodoLabel(p.periodo_reporte)).reverse();

  // PARTICIPACIÓN ZONAS
  const totalBajasEmpresa = latest.bajas || 1;
  const totalNuevosEmpresa = latest.nuevos_mes || 1;
  const totalActivosFinalEmpresa = latest.activos_final || 1;

  const zonasList = dimensiones.zona || dimensiones.zona_sucursal || [];

  const zonasChurnShare = zonasList.map((z) => {
    const bajasZona = Number(z.bajas || 0);
    const churnBrutoZonaPct = Number(z.churn_bruto_pct || 0);
    const shareBajasPct = (bajasZona / totalBajasEmpresa) * 100;
    return { zona: z.valor, bajas: bajasZona, churnBrutoZonaPct, shareBajasPct };
  }).sort((a, b) => b.shareBajasPct - a.shareBajasPct);

  const zonasChurnMayores = zonasChurnShare.filter((z) => z.shareBajasPct >= 2.5);
  const zonasChurnMenoresSum = zonasChurnShare.filter((z) => z.shareBajasPct < 2.5).reduce((acc, z) => acc + z.shareBajasPct, 0);

  const churnDoughnutLabels = [
    ...zonasChurnMayores.map((z) => z.zona),
    ...(zonasChurnMenoresSum > 0 ? ['Otras Zonas (<2.5%)'] : []),
  ];
  const churnDoughnutData = [
    ...zonasChurnMayores.map((z) => Number(z.shareBajasPct.toFixed(2))),
    ...(zonasChurnMenoresSum > 0 ? [Number(zonasChurnMenoresSum.toFixed(2))] : []),
  ];

  const zonasCrecimientoShare = zonasList.map((z) => {
    const nuevosZona = Number(z.nuevos || 0);
    const crecimientoZonaPct = Number(z.crecimiento || 0);
    const shareNuevosPct = (nuevosZona / totalNuevosEmpresa) * 100;
    return { zona: z.valor, nuevos: nuevosZona, crecimientoZonaPct, shareNuevosPct };
  }).sort((a, b) => b.shareNuevosPct - a.shareNuevosPct);

  const zonasCrecimientoMayores = zonasCrecimientoShare.filter((z) => z.shareNuevosPct >= 2.5);
  const zonasCrecimientoMenoresSum = zonasCrecimientoShare.filter((z) => z.shareNuevosPct < 2.5).reduce((acc, z) => acc + z.shareNuevosPct, 0);

  const crecimientoDoughnutLabels = [
    ...zonasCrecimientoMayores.map((z) => z.zona),
    ...(zonasCrecimientoMenoresSum > 0 ? ['Otras Zonas (<2.5%)'] : []),
  ];
  const crecimientoDoughnutData = [
    ...zonasCrecimientoMayores.map((z) => Number(z.shareNuevosPct.toFixed(2))),
    ...(zonasCrecimientoMenoresSum > 0 ? [Number(zonasCrecimientoMenoresSum.toFixed(2))] : []),
  ];

  // OPCS DONAS
  const doughnutOptionsChurn: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    customCenterText: {
      title: hoveredChurnZone ? `Churn ${hoveredChurnZone.name}` : 'Churn Bruto Prom.',
      value: hoveredChurnZone ? `${hoveredChurnZone.churnPct.toFixed(2)}%` : `${avgChurnBrutoNum.toFixed(2)}%`,
      color: '#ff2a5f',
    },
    onHover: (event: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const index = elements[0].index;
        const labelName = churnDoughnutLabels[index];
        const zoneObj = zonasChurnShare.find((z) => z.zona === labelName);
        setHoveredChurnZone(zoneObj ? { name: zoneObj.zona, churnPct: zoneObj.churnBrutoZonaPct } : { name: labelName, churnPct: 0 });
      } else {
        setHoveredChurnZone(null);
      }
    },
    plugins: {
      legend: { display: true, position: 'right' as const, labels: { color: '#cbd5e1', font: { size: 10 }, padding: 10, usePointStyle: true } },
      datalabels: { color: '#ffffff', font: { weight: 'bold' as const, size: 10 }, formatter: (val: number) => (val >= 1.0 ? `${val.toFixed(1)}%` : '') },
    },
  };

  const doughnutOptionsCrecimiento: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    customCenterText: {
      title: hoveredCrecimientoZone ? `Crec. ${hoveredCrecimientoZone.name}` : 'Crecimiento Prom.',
      value: hoveredCrecimientoZone ? `${hoveredCrecimientoZone.crecimientoPct > 0 ? '+' : ''}${hoveredCrecimientoZone.crecimientoPct.toFixed(2)}%` : `${avgCrecimientoNum.toFixed(2)}%`,
      color: '#00ff88',
    },
    onHover: (event: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const index = elements[0].index;
        const labelName = crecimientoDoughnutLabels[index];
        const zoneObj = zonasCrecimientoShare.find((z) => z.zona === labelName);
        setHoveredCrecimientoZone(zoneObj ? { name: zoneObj.zona, crecimientoPct: zoneObj.crecimientoZonaPct } : { name: labelName, crecimientoPct: 0 });
      } else {
        setHoveredCrecimientoZone(null);
      }
    },
    plugins: {
      legend: { display: true, position: 'right' as const, labels: { color: '#cbd5e1', font: { size: 10 }, padding: 10, usePointStyle: true } },
      datalabels: { color: '#ffffff', font: { weight: 'bold' as const, size: 10 }, formatter: (val: number) => (val >= 1.0 ? `${val.toFixed(1)}%` : '') },
    },
  };

  // DATASETS
  const churnChartData = {
    labels: labelsFormatted,
    datasets: [
      { type: 'line' as const, label: 'Churn Neto %', data: [...periodos].map((p) => p.churn_neto_pct).reverse(), borderColor: '#00ff88', borderWidth: 3, fill: false, tension: 0.35 },
      { type: 'line' as const, label: 'Churn Bruto %', data: [...periodos].map((p) => p.churn_bruto_pct).reverse(), borderColor: '#ff2a5f', borderDash: [5, 5], borderWidth: 2.5, fill: false, tension: 0.35 },
    ],
  };

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
          formatter: (val: number) => `-${Math.abs(val).toFixed(2)}%` },
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

  const aporteReemplazoData = {
    labels: labelsFormatted,
    datasets: [
      { type: 'bar' as const, label: 'Tasa Aporte Reactivación %', data: [...periodos].map((p) => p.tasa_aporte_react_pct || 0).reverse(), backgroundColor: 'rgba(37, 99, 235, 0.85)', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 6 },
      { type: 'bar' as const, label: 'Índice Reemplazo %', data: [...periodos].map((p) => p.indice_reemplazo_react_pct || 0).reverse(), backgroundColor: 'rgba(0, 255, 136, 0.85)', borderColor: '#00ff88', borderWidth: 1.5, borderRadius: 6 },
    ],
  };

  const suspensionWinbackData = {
    labels: labelsFormatted,
    datasets: [
      { label: 'Suspensiones', data: [...periodos].map((p) => p.corte_impagado || 0).reverse(), borderColor: '#ff2a5f', backgroundColor: 'rgba(255, 42, 95, 0.2)', fill: true, tension: 0.35 },
      { label: 'Recuperaciones', data: [...periodos].map((p) => p.react_4_P || 0).reverse(), borderColor: '#25ff03', backgroundColor: 'rgba(37, 255, 3, 0.49)', fill: true, borderDash: [4, 4], tension: 0.35 },
    ],
  };

  const zonasChurnDoughnut = {
    labels: churnDoughnutLabels,
    datasets: [{ data: churnDoughnutData, backgroundColor: PALETTE.slice(0, churnDoughnutLabels.length), borderWidth: 2, borderColor: '#0f1a36' }],
  };

  const zonasCrecimientoDoughnut = {
    labels: crecimientoDoughnutLabels,
    datasets: [{ data: crecimientoDoughnutData, backgroundColor: PALETTE.slice(0, crecimientoDoughnutLabels.length), borderWidth: 2, borderColor: '#0f1a36' }],
  };

  return (
    <AppLayout title="Subscriptions Analytics">
      <SubHeader activeTab="dashboard" />

      {/* FILA 1: KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Churn Rate Neto Promedio" value={`${avgChurnNetoNum.toFixed(2)}%`} color={getChurnColor(avgChurnNetoNum)} subValue={`Promedio de ${totalPeriodos} periodos`} />
        <MetricCard label="Churn Rate Bruto Promedio" value={`${avgChurnBrutoNum.toFixed(2)}%`} color={getChurnColor(avgChurnBrutoNum)} subValue={`Promedio de ${totalPeriodos} periodos`} />
        <MetricCard label="Crecimiento Promedio" value={`${avgCrecimientoNum.toFixed(2)}%`} color={getCrecimientoColor(avgCrecimientoNum)} subValue="Variación neta promedio" />
        <MetricCard label="ARPU Promedio" value={`$${latest.arpu}`} color="yellow" subValue="Ingreso medio por suscriptor" />
      </div>

      {/* FILA 2: KPI CARDS ADICIONALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Tasa Aporte Reactivaciones" value={`${avgTasaAporte.toFixed(2)}%`} color="blue" subValue="Peso de reactivados en ingresos" />
        <MetricCard label="Índice Reemplazo Bajas" value={`${avgIndiceReemplazo.toFixed(2)}%`} color="green" subValue="Cobertura winback de bajas" />
        <MetricCard label="Porcentaje Suspensiones" value={`${avgSuspensiones.toFixed(2)}%`} color="red" subValue="Corte impago / Activos inicio" />
        <MetricCard label="Tasa Winback Promedio" value={`${avgWinback.toFixed(2)}%`} color="yellow" subValue="Recuperación sobre inactivos" />
      </div>

      {/* FILA DE GRÁFICOS 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Evolución Churn Rate (Neto vs Bruto)">
          <Line data={churnChartData} options={baseLineOptions} />
        </ChartCard>

        <ChartCard title="Análisis de Crecimiento Neto">
          <Bar data={crecimientoChartData} options={baseLineOptions} />
        </ChartCard>
      </div>

      {/* FILA DE GRÁFICOS 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Tasa de Aporte vs Índice de Reemplazo">
          <Bar data={aporteReemplazoData} options={horizontalBarOptions} />
        </ChartCard>

        <ChartCard title="Porcentaje Suspensiones vs Tasa Winback">
          <Line data={suspensionWinbackData} options={baseLineOptions} />
        </ChartCard>
      </div>

      {/* FILA DE GRÁFICOS 3: DONAS PONDERADAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Concentración % de Bajas por Zona" subtitle="Pasa el cursor para ver el Churn % de esa Zona">
          <Doughnut data={zonasChurnDoughnut} options={doughnutOptionsChurn} plugins={[centerTextPlugin]} />
        </ChartCard>

        <ChartCard title="Concentración % de Ventas por Zona" subtitle="Pasa el cursor para ver el Crecimiento % de esa Zona">
          <Doughnut data={zonasCrecimientoDoughnut} options={doughnutOptionsCrecimiento} plugins={[centerTextPlugin]} />
        </ChartCard>
      </div>
    </AppLayout>
  );
}