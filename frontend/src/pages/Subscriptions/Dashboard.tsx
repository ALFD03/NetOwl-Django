import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { formatPeriodoLabel, getChurnColor, getCrecimientoColor, PALETTE } from '@/utils/formatters';
import { centerTextPlugin } from '@/components/Charts/plugins';
import { baseLineOptions, horizontalBarOptions, getDoughnutOptions, handleHover } from '@/components/Charts/chartOptions';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {
  TrendingUp, TrendingDown, RefreshCw, DollarSign,
  Activity, PieChart, BarChart3, AlertTriangle, ShieldCheck
} from 'lucide-react';

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
  activos_inicio: number;
  activos_final: number;
  churn_bruto_pct: number;
  crecimiento: number;
}

interface Props {
  periodos: PeriodoData[];
  dimensiones?: Record<string, ZonaData[]>;
}

export default function SubscriptionsDashboard({ periodos = [], dimensiones = {} }: Props) {
  const [hoveredChurnZone, setHoveredChurnZone] = useState<{ name: string; val: string } | null>(null);
  const [hoveredCrecimientoZone, setHoveredCrecimientoZone] = useState<{ name: string; val: string } | null>(null);

  const latest = periodos[0] || { arpu: 0, bajas: 1, nuevos_mes: 1, activos_final: 1 };
  const totalPeriodos = periodos.length;
  
  const reversedPeriodos = useMemo(() => [...periodos].reverse(), [periodos]);
  const labelsFormatted = useMemo(() => reversedPeriodos.map((p) => formatPeriodoLabel(p.periodo_reporte)), [reversedPeriodos]);

  const avgChurnNetoNum = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.churn_neto_pct || 0), 0) / totalPeriodos : 0;
  const avgChurnBrutoNum = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.churn_bruto_pct || 0), 0) / totalPeriodos : 0;
  const avgCrecimientoNum = totalPeriodos > 0
    ? periodos.reduce((acc, p) => acc + (p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0), 0) / totalPeriodos
    : 0;

  const avgTasaAporte = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.tasa_aporte_react_pct || 0), 0) / totalPeriodos : 0;
  const avgIndiceReemplazo = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.indice_reemplazo_react_pct || 0), 0) / totalPeriodos : 0;
  const avgSuspensiones = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.porcentaje_suspensiones || 0), 0) / totalPeriodos : 0;
  const avgWinback = totalPeriodos > 0 ? periodos.reduce((acc, p) => acc + (p.tasa_winback_pct || 0), 0) / totalPeriodos : 0;

  const churnEmpresaPct = latest.churn_bruto_pct || 1;
  const totalActivosInicioEmpresa = latest.activos_inicio || 1;

  const zonasChurnElasticidad = useMemo(() => {
    const zonasMap: Record<string, { sumaChurnPct: number; sumaActivosInicio: number; sumaBajas: number; conteo: number }> = {};

    (dimensiones.zona || []).forEach((z) => {
      const nombreZona = z.valor;
      if (!zonasMap[nombreZona]) {
        zonasMap[nombreZona] = { sumaChurnPct: 0, sumaActivosInicio: 0, sumaBajas: 0, conteo: 0 };
      }
      zonasMap[nombreZona].sumaChurnPct += Number(z.churn_bruto_pct || 0);
      zonasMap[nombreZona].sumaActivosInicio += Number(z.activos_inicio || 0);
      zonasMap[nombreZona].sumaBajas += Number(z.bajas || 0);
      zonasMap[nombreZona].conteo += 1;
    });

    return Object.entries(zonasMap)
      .map(([zona, datos]) => {
        const cantidad = datos.conteo || 1;
        const churnZonaPct = datos.sumaChurnPct / cantidad; 
        const activosInicioZona = datos.sumaActivosInicio / cantidad; 
        const bajasZona = datos.sumaBajas / cantidad; 

        const multiplicadorRiesgo = churnEmpresaPct > 0 ? churnZonaPct / churnEmpresaPct : 0;
        const aporteRiesgoPonderadoPct = (multiplicadorRiesgo * (activosInicioZona / totalActivosInicioEmpresa)) * 100;

        return {
          zona,
          bajas: bajasZona,
          churnZonaPct,
          multiplicadorRiesgo,
          shareBajasPct: aporteRiesgoPonderadoPct,
        };
      })
      .sort((a, b) => b.shareBajasPct - a.shareBajasPct);
  }, [dimensiones.zona, churnEmpresaPct, totalActivosInicioEmpresa]);

  const zonasChurnMayores = zonasChurnElasticidad.filter((z) => z.shareBajasPct >= 1.0);
  const zonasChurnMenoresSum = zonasChurnElasticidad
    .filter((z) => z.shareBajasPct < 1.0)
    .reduce((acc, z) => acc + z.shareBajasPct, 0);

  const zonasCrecimientoElasticidad = useMemo(() => {
    const zonasMap: Record<string, { sumaCrecimientoPct: number; sumaActivosInicio: number; sumaNuevos: number; conteo: number }> = {};

    (dimensiones.zona || []).forEach((z) => {
      const nombreZona = z.valor;
      if (!zonasMap[nombreZona]) {
        zonasMap[nombreZona] = { sumaCrecimientoPct: 0, sumaActivosInicio: 0, sumaNuevos: 0, conteo: 0 };
      }
      zonasMap[nombreZona].sumaCrecimientoPct += Number(z.crecimiento || 0);
      zonasMap[nombreZona].sumaActivosInicio += Number(z.activos_inicio || 0);
      zonasMap[nombreZona].sumaNuevos += Number(z.nuevos || 0);
      zonasMap[nombreZona].conteo += 1;
    });

    const totalNuevosGlobal = Object.values(zonasMap).reduce((acc, datos) => acc + datos.sumaNuevos, 0);

    return Object.entries(zonasMap)
      .map(([zona, datos]) => {
        const cantidad = datos.conteo || 1;
        const avgCrecimiento = datos.sumaCrecimientoPct / cantidad;
        const shareCrecimientoPct = totalNuevosGlobal > 0 ? (datos.sumaNuevos / totalNuevosGlobal) * 100 : 0;
        return { zona, avgCrecimiento, shareCrecimientoPct };
      })
      .sort((a, b) => b.shareCrecimientoPct - a.shareCrecimientoPct);
  }, [dimensiones.zona]);

  const zonasCrecMayores = zonasCrecimientoElasticidad.filter((z) => z.shareCrecimientoPct >= 1.0);
  const zonasCrecMenoresSum = zonasCrecimientoElasticidad
    .filter((z) => z.shareCrecimientoPct < 1.0)
    .reduce((acc, z) => acc + z.shareCrecimientoPct, 0);

  const churnChartData = {
    labels: labelsFormatted,
    datasets: [
      { type: 'line' as const, label: 'Churn Neto %', data: reversedPeriodos.map((p) => Number(p.churn_neto_pct.toFixed(2))), borderColor: '#00ff88', borderWidth: 3, fill: false, tension: 0.35 },
      { type: 'line' as const, label: 'Churn Bruto %', data: reversedPeriodos.map((p) => Number(p.churn_bruto_pct.toFixed(2))), borderColor: '#ff2a5f', borderDash: [5, 5], borderWidth: 2.5, fill: false, tension: 0.35 },
    ],
  };

  const crecimientoChartData = {
    labels: labelsFormatted,
    datasets: [
      {
        type: 'bar' as const,
        label: 'Churn Bruto',
        stack: 'loss',
        data: reversedPeriodos.map((p) => Number(-p.churn_bruto_pct.toFixed(2))),
        backgroundColor: 'rgba(255, 42, 95, 0.85)',
        borderRadius: 6,
        datalabels: {
          display: true,
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
        data: reversedPeriodos.map((p) => {
          const crec = p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0;
          const totalEntradas = (p.nuevos_mes || 0) + (p.react_val || 0);
          const tasaAporte = totalEntradas > 0 ? (p.react_val / totalEntradas) : 0;
          return Number((crec * tasaAporte).toFixed(2));
        }),
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        borderRadius: 6,
        datalabels: { display: false },
      },
      {
        type: 'bar' as const,
        label: 'Nuevos Clientes',
        stack: 'growth',
        data: reversedPeriodos.map((p) => {
          const crec = p.activos_inicio > 0 ? ((p.activos_final - p.activos_inicio) / p.activos_inicio) * 100 : 0;
          const totalEntradas = (p.nuevos_mes || 0) + (p.react_val || 0);
          const tasaAporte = totalEntradas > 0 ? (p.react_val / totalEntradas) : 0;
          return Number((crec * (1 - tasaAporte)).toFixed(2));
        }),
        backgroundColor: 'rgba(0, 255, 136, 0.85)',
        borderRadius: 6,
        datalabels: {
          display: true,
          anchor: 'end' as const,
          align: 'end' as const,
          offset: 4,
          color: '#00ff88',
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number, context: any) => {
            const index = context.dataIndex;
            const p = reversedPeriodos[index];
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
      {
        type: 'bar' as const,
        label: 'Tasa Aporte Reactivación %',
        data: reversedPeriodos.map((p) => Number(p.tasa_aporte_react_pct.toFixed(2)) || 0),
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        borderRadius: 6,
        datalabels: {
          display: true,
          anchor: 'end' as const,
          align: 'end' as const,
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number) => `${val.toLocaleString()}%`,
          offset: 4,
          color: '#3b82f6',
        },
      },
      {
        type: 'bar' as const,
        label: 'Índice Reemplazo %',
        data: reversedPeriodos.map((p) => Number(p.indice_reemplazo_react_pct.toFixed(2)) || 0),
        backgroundColor: 'rgba(0, 255, 136, 0.85)',
        borderRadius: 6,
        datalabels: {
          display: true,
          anchor: 'end' as const,
          align: 'end' as const,
          font: { weight: 'bold' as const, size: 10 },
          formatter: (val: number) => `${val.toLocaleString()}%`,
          offset: 4,
          color: '#00ff88',
        },
      },
    ],
  };

  const suspensionWinbackData = {
    labels: labelsFormatted,
    datasets: [
      { label: 'Suspensiones', data: reversedPeriodos.map((p) => Number(p.corte_impagado) || 0), borderColor: '#ff2a5f', backgroundColor: 'rgba(255, 42, 95, 0.2)', fill: true, tension: 0.35 },
      { label: 'Recuperaciones', data: reversedPeriodos.map((p) => Number(p.react_4_P) || 0), borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.2)', fill: true, borderDash: [4, 4], tension: 0.35 },
    ],
  };

  const churnDonutData = useMemo(() => {
    const labels = [
      ...zonasChurnMayores.map((z) => z.zona),
      ...(zonasChurnMenoresSum > 0 ? ['Otras Zonas (<1.0%)'] : []),
    ];

    const dataValues = [
      ...zonasChurnMayores.map((z) => Number(z.shareBajasPct.toFixed(2))),
      ...(zonasChurnMenoresSum > 0 ? [Number(zonasChurnMenoresSum.toFixed(2))] : []),
    ];

    return {
      labels,
      datasets: [{
        data: dataValues,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#0f1a36',
      }],
      _raw: [
        ...zonasChurnElasticidad.map(z => ({ label: z.zona, original: z.churnZonaPct })),
        { label: 'Otras Zonas (<1.0%)', original: 0 }
      ]
    };
  }, [zonasChurnMayores, zonasChurnMenoresSum, zonasChurnElasticidad]);

  const crecimientoDonutData = useMemo(() => {
    const labels = [
      ...zonasCrecMayores.map((z) => z.zona),
      ...(zonasCrecMenoresSum > 0 ? ['Otras Zonas (<1.0%)'] : []),
    ];

    const dataValues = [
      ...zonasCrecMayores.map((z) => Number(z.shareCrecimientoPct.toFixed(2))),
      ...(zonasCrecMenoresSum > 0 ? [Number(zonasCrecMenoresSum.toFixed(2))] : []),
    ];

    return {
      labels,
      datasets: [{
        data: dataValues,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#0f1a36',
      }],
      _raw: [
        ...zonasCrecimientoElasticidad.map(z => ({ label: z.zona, original: z.avgCrecimiento })),
        { label: 'Otras Zonas (<1.0%)', original: 0 }
      ]
    };
  }, [zonasCrecMayores, zonasCrecMenoresSum, zonasCrecimientoElasticidad]);

  const churnDonutOptions = useMemo(() => getDoughnutOptions(
    {
      title: hoveredChurnZone ? `Churn ${hoveredChurnZone.name}` : 'Churn Bruto Prom.',
      value: hoveredChurnZone ? hoveredChurnZone.val : `${avgChurnBrutoNum.toFixed(2)}%`,
      color: '#ff2a5f',
    },
    handleHover(setHoveredChurnZone, churnDonutData)
  ), [hoveredChurnZone, avgChurnBrutoNum, churnDonutData]);

  const crecimientoDonutOptions = useMemo(() => getDoughnutOptions(
    {
      title: hoveredCrecimientoZone ? `Crec. ${hoveredCrecimientoZone.name}` : 'Crec. Prom. Global',
      value: hoveredCrecimientoZone 
        ? hoveredCrecimientoZone.val 
        : `${avgCrecimientoNum > 0 ? '+' : ''}${avgCrecimientoNum.toFixed(2)}%`,
      color: '#00ff88',
    },
    handleHover(setHoveredCrecimientoZone, crecimientoDonutData)
  ), [hoveredCrecimientoZone, avgCrecimientoNum, crecimientoDonutData]);
  
  return (
    <AppLayout title="Subscriptions Analytics">
      <SubHeader activeTab="dashboard" />

      {/* FILA 1: KPI CARDS VIBRANTES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard
          label="Churn Rate Neto Promedio"
          value={`${avgChurnNetoNum.toFixed(2)}%`}
          color={getChurnColor(avgChurnNetoNum)}
          subValue="Promedio global"
          icon={<TrendingDown className="w-4 h-4 text-emerald-400" />}
        />
        <MetricCard
          label="Churn Rate Bruto Promedio"
          value={`${avgChurnBrutoNum.toFixed(2)}%`}
          color={getChurnColor(avgChurnBrutoNum)}
          subValue="Promedio global"
          icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
        />
        <MetricCard
          label="Crecimiento Promedio"
          value={`${avgCrecimientoNum.toFixed(2)}%`}
          color={getCrecimientoColor(avgCrecimientoNum)}
          subValue="Crecimiento neto"
          icon={<TrendingUp className="w-4 h-4 text-sky-400" />}
        />
        <MetricCard
          label="ARPU Promedio"
          value={`$${latest.arpu}`}
          color="yellow"
          subValue="Ingreso medio mensual"
          icon={<DollarSign className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* FILA 2: KPI CARDS ADICIONALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Tasa Aporte Reactivaciones"
          value={`${avgTasaAporte.toFixed(2)}%`}
          color="blue"
          subValue="Peso en adiciones"
          icon={<RefreshCw className="w-4 h-4 text-sky-400" />}
        />
        <MetricCard
          label="Índice Reemplazo Bajas"
          value={`${avgIndiceReemplazo.toFixed(2)}%`}
          color="green"
          subValue="Cobertura sobre churn"
          icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
        />
        <MetricCard
          label="Porcentaje Suspensiones"
          value={`${avgSuspensiones.toFixed(2)}%`}
          color="red"
          subValue="Corte por impago"
          icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
        />
        <MetricCard
          label="Tasa Winback Promedio"
          value={`${avgWinback.toFixed(2)}%`}
          color="yellow"
          subValue="Recuperados / Inactivos"
          icon={<Activity className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* FILA DE GRÁFICOS 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <NeonContainer
          theme="red"
          title="Evolución Churn Rate"
          subtitle="Neto vs Bruto Histórico"
          icon={<Activity className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Line data={churnChartData} options={baseLineOptions} />
          </div>
        </NeonContainer>

        <NeonContainer
          theme="green"
          title="Análisis de Crecimiento"
          subtitle="Nuevos vs Reactivaciones vs Churn"
          icon={<BarChart3 className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Bar data={crecimientoChartData} options={horizontalBarOptions} />
          </div>
        </NeonContainer>
      </div>

      {/* FILA DE GRÁFICOS 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <NeonContainer
          theme="blue"
          title="Comportamiento de Reactivaciones"
          subtitle="Aporte al crecimiento e índice de reemplazo"
          icon={<BarChart3 className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Bar data={aporteReemplazoData} options={horizontalBarOptions} />
          </div>
        </NeonContainer>

        <NeonContainer
          theme="yellow"
          title="Balanza de Recuperaciones"
          subtitle="Suspensiones vs Reactivaciones de Pausa"
          icon={<Activity className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Line data={suspensionWinbackData} options={baseLineOptions} />
          </div>
        </NeonContainer>
      </div>

      {/* FILA DE GRÁFICOS 3: DONAS PONDERADAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <NeonContainer
          theme="red"
          title="Concentración % de Bajas por Zona"
          subtitle="Pasa el cursor para ver el Churn % de esa Zona"
          icon={<PieChart className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Doughnut data={churnDonutData} options={churnDonutOptions} plugins={[centerTextPlugin, ChartDataLabels]} />
          </div>
        </NeonContainer>

        <NeonContainer
          theme="green"
          title="Concentración % de Ventas por Zona"
          subtitle="Pasa el cursor para ver el Crecimiento % de esa Zona"
          icon={<PieChart className="w-5 h-5" />}
        >
          <div className="h-72 w-full">
            <Doughnut data={crecimientoDonutData} options={crecimientoDonutOptions} plugins={[centerTextPlugin, ChartDataLabels]} />
          </div>
        </NeonContainer>
      </div>
    </AppLayout>
  );
}