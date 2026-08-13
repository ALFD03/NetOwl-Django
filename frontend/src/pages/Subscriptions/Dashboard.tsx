import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { ChartCard } from '@/components/UI/ChartCard';
import { formatPeriodoLabel, getChurnColor, getCrecimientoColor, PALETTE } from '@/utils/formatters';
import { centerTextPlugin } from '@/components/Charts/plugins';
import { baseLineOptions, horizontalBarOptions, getDoughnutOptions } from '@/components/Charts/chartOptions';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
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

//! ---------- Calcular Promedio globales de KPIs ----------
export default function SubscriptionsDashboard({ periodos = [], dimensiones = {} }: Props) {
  const [hoveredChurnZone, setHoveredChurnZone] = useState<{ name: string; churnPct: number } | null>(null);

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

//! ---------- Calcular Peso de zonas en Donas ----------
  const churnEmpresaPct = latest.churn_bruto_pct || 1;
  const totalActivosInicioEmpresa = latest.activos_inicio || 1;

// 1. Agrupar y promediar los datos históricos de cada zona
const zonasChurnElasticidad = useMemo(() => {
  const zonasMap: Record<
    string,
    {
      sumaChurnPct: number;
      sumaActivosInicio: number;
      sumaBajas: number;
      conteo: number;
    }
  > = {};

  // Iterar sobre la lista aplanada de todos los períodos
  (dimensiones.zona || []).forEach((z) => {
    const nombreZona = z.valor;
    if (!zonasMap[nombreZona]) {
      zonasMap[nombreZona] = {
        sumaChurnPct: 0,
        sumaActivosInicio: 0,
        sumaBajas: 0,
        conteo: 0,
      };
    }

    zonasMap[nombreZona].sumaChurnPct += Number(z.churn_bruto_pct || 0);
    zonasMap[nombreZona].sumaActivosInicio += Number(z.activos_inicio || 0);
    zonasMap[nombreZona].sumaBajas += Number(z.bajas || 0);
    zonasMap[nombreZona].conteo += 1;
  });

  // 2. Mapear cada zona consolidada con sus promedios
  return Object.entries(zonasMap)
    .map(([zona, datos]) => {
      const cantidad = datos.conteo || 1;
      const churnZonaPct = datos.sumaChurnPct / cantidad; // Churn promedio de la zona
      const activosInicioZona = datos.sumaActivosInicio / cantidad; // Activos promedio
      const bajasZona = datos.sumaBajas / cantidad; // Bajas promedio

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

  const churnDoughnutLabels = [
    ...zonasChurnMayores.map((z) => z.zona),
    ...(zonasChurnMenoresSum > 0 ? ['Otras Zonas (<1.0%)'] : []),
  ];

  const churnDoughnutData = [
    ...zonasChurnMayores.map((z) => Number(z.shareBajasPct.toFixed(2))),
    ...(zonasChurnMenoresSum > 0 ? [Number(zonasChurnMenoresSum.toFixed(2))] : []),
  ];

  const [hoveredCrecimientoZone, setHoveredCrecimientoZone] = useState<{ name: string; crecPct: number } | null>(null);

  const zonasCrecimientoElasticidad = useMemo(() => {
  const zonasMap: Record<
    string,
    {
      sumaCrecimientoPct: number;
      sumaActivosInicio: number;
      sumaNuevos: number;
      conteo: number;
    }
  > = {};

  // 1. Agrupar la lista aplanada de todos los períodos
  (dimensiones.zona || []).forEach((z) => {
    const nombreZona = z.valor;
    if (!zonasMap[nombreZona]) {
      zonasMap[nombreZona] = {
        sumaCrecimientoPct: 0,
        sumaActivosInicio: 0,
        sumaNuevos: 0,
        conteo: 0,
      };
    }

    zonasMap[nombreZona].sumaCrecimientoPct += Number(z.crecimiento || 0);
    zonasMap[nombreZona].sumaActivosInicio += Number(z.activos_inicio || 0);
    zonasMap[nombreZona].sumaNuevos += Number(z.nuevos || 0);
    zonasMap[nombreZona].conteo += 1;
  });

  // 2. Calcular total global de nuevos clientes para ponderar la cuota/aporte
  const totalNuevosGlobal = Object.values(zonasMap).reduce(
    (acc, datos) => acc + datos.sumaNuevos,
    0
  );

  // 3. Mapear cada zona con su Promedio y Share
  return Object.entries(zonasMap)
    .map(([zona, datos]) => {
      const cantidad = datos.conteo || 1;
      const avgCrecimiento = datos.sumaCrecimientoPct / cantidad; // Crecimiento Promedio %
      
      // Peso o Aporte de la zona al crecimiento global basado en nuevos clientes
      const shareCrecimientoPct = totalNuevosGlobal > 0 
        ? (datos.sumaNuevos / totalNuevosGlobal) * 100 
        : 0;

      return {
        zona,
        avgCrecimiento,
        shareCrecimientoPct,
      };
    })
    .sort((a, b) => b.shareCrecimientoPct - a.shareCrecimientoPct);
  }, [dimensiones.zona]);

  // 4. Filtrar zonas mayores a 1.0% de aporte y agrupar las menores
  const zonasCrecMayores = zonasCrecimientoElasticidad.filter((z) => z.shareCrecimientoPct >= 1.0);
  const zonasCrecMenoresSum = zonasCrecimientoElasticidad
    .filter((z) => z.shareCrecimientoPct < 1.0)
    .reduce((acc, z) => acc + z.shareCrecimientoPct, 0);

  const crecimientoDoughnutLabels = [
    ...zonasCrecMayores.map((z) => z.zona),
    ...(zonasCrecMenoresSum > 0 ? ['Otras Zonas (<1.0%)'] : []),
  ];

  const crecimientoDoughnutData = [
    ...zonasCrecMayores.map((z) => Number(z.shareCrecimientoPct.toFixed(2))),
    ...(zonasCrecMenoresSum > 0 ? [Number(zonasCrecMenoresSum.toFixed(2))] : []),
  ];

//! ---------- Opciones Especializadas ----------
  //? Opciones para dona de churn por zona
  const doughnutOptionsChurn = getDoughnutOptions(
    {
      title: hoveredChurnZone ? `Churn promedio ${hoveredChurnZone.name}` : 'Churn Bruto Prom.',
      value: hoveredChurnZone ? `${hoveredChurnZone.churnPct.toFixed(2)}%` : `${avgChurnBrutoNum.toFixed(2)}%`,
      color: '#ff2a5f',
    },
    (event: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const index = elements[0].index;
        const labelName = churnDoughnutLabels[index];
        const zoneObj = zonasChurnElasticidad.find((z) => z.zona === labelName);
        
        const newZone = zoneObj 
          ? { name: zoneObj.zona, churnPct: zoneObj.churnZonaPct } 
          : { name: labelName, churnPct: 0 };

        setHoveredChurnZone((prev) => {
          if (prev?.name === newZone.name) return prev;
          return newZone;
        });
      } else {
        setHoveredChurnZone((prev) => (prev !== null ? null : null));
      }
    }
  );

  const doughnutOptionsCrecimiento = getDoughnutOptions(
  {
    title: hoveredCrecimientoZone ? `Crec. promedio ${hoveredCrecimientoZone.name}` : 'Crec. Prom. Global',
    value: hoveredCrecimientoZone 
      ? `${hoveredCrecimientoZone.crecPct > 0 ? '+' : ''}${hoveredCrecimientoZone.crecPct.toFixed(2)}%` 
      : `${avgCrecimientoNum > 0 ? '+' : ''}${avgCrecimientoNum.toFixed(2)}%`,
    color: '#00ff88',
  },
  (event: any, elements: any[]) => {
    if (elements && elements.length > 0) {
      const index = elements[0].index;
      const labelName = crecimientoDoughnutLabels[index];
      const zoneObj = zonasCrecimientoElasticidad.find((z) => z.zona === labelName);
      
      const newZone = zoneObj 
        ? { name: zoneObj.zona, crecPct: zoneObj.avgCrecimiento } 
        : { name: labelName, crecPct: 0 };

      setHoveredCrecimientoZone((prev) => {
        if (prev?.name === newZone.name) return prev;
        return newZone;
      });
    } else {
      setHoveredCrecimientoZone((prev) => (prev !== null ? null : null));
    }
  });

//! ---------- Definicion de Data Sets para graficos ----------
  //? DataSet para grafico de Crecimiento Promedio de zonas
  const zonasCrecimientoDoughnut = {
    labels: crecimientoDoughnutLabels,
    datasets: [
      {
        data: crecimientoDoughnutData,
        backgroundColor: PALETTE.slice(0, crecimientoDoughnutLabels.length),
        borderWidth: 2,
        borderColor: '#0f1a36',
      },
    ],
  };

  //? DataSet para grafico de Churn Rate Neto y Bruto
  const churnChartData = {
    labels: labelsFormatted,
    datasets: [
      { type: 'line' as const, label: 'Churn Neto %', data: reversedPeriodos.map((p) => Number(p.churn_neto_pct.toFixed(2))), borderColor: '#00ff88', borderWidth: 3, fill: false, tension: 0.35 },
      { type: 'line' as const, label: 'Churn Bruto %', data: reversedPeriodos.map((p) => Number(p.churn_bruto_pct.toFixed(2))), borderColor: '#ff2a5f', borderDash: [5, 5], borderWidth: 2.5, fill: false, tension: 0.35 },
    ],
  };

  //? DataSet para grafico de evolución de crecimiento
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
          clip: false,
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

  //? DataSet para grafico de Aporte de Reactivaciones y Cobertura de Bajas
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
          clip: false,
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
          clip: false,
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

  //? DataSet para grafico de Suspensiones y Recuperaciones
  const suspensionWinbackData = {
    labels: labelsFormatted,
    datasets: [
      { label: 'Suspensiones', data: reversedPeriodos.map((p) => Number(p.corte_impagado) || 0), borderColor: '#ff2a5f', backgroundColor: 'rgba(255, 42, 95, 0.2)', fill: true, tension: 0.35 },
      { label: 'Recuperaciones', data: reversedPeriodos.map((p) => Number(p.react_4_P) || 0), borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.2)', fill: true, borderDash: [4, 4], tension: 0.35 },
    ],
  };

  //? DataSet para grafico de Churn por Zona
  const zonasChurnDoughnut = {
    labels: churnDoughnutLabels,
    datasets: [{ data: churnDoughnutData, backgroundColor: PALETTE.slice(0, churnDoughnutLabels.length), borderWidth: 2, borderColor: '#0f1a36' }],
  };

//! ---------- Renderizado de Componentes ----------
  return (
    <AppLayout title="Subscriptions Analytics">
      <SubHeader activeTab="dashboard" />

      {/* FILA 1: KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Churn Rate Neto Promedio" value={`${avgChurnNetoNum.toFixed(2)}%`} color={getChurnColor(avgChurnNetoNum)} subValue={`Promedio global`} />
        <MetricCard label="Churn Rate Bruto Promedio" value={`${avgChurnBrutoNum.toFixed(2)}%`} color={getChurnColor(avgChurnBrutoNum)} subValue={`Promedio global`} />
        <MetricCard label="Crecimiento Promedio" value={`${avgCrecimientoNum.toFixed(2)}%`} color={getCrecimientoColor(avgCrecimientoNum)} subValue="Crecimiento promedio" />
        <MetricCard label="ARPU Promedio" value={`$${latest.arpu}`} color="yellow" subValue="Ingreso medio por suscriptor" />
      </div>

      {/* FILA 2: KPI CARDS ADICIONALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Tasa Aporte Reactivaciones" value={`${avgTasaAporte.toFixed(2)}%`} color="blue" subValue="Promedio del peso de las reactivaciones al crecimiento" />
        <MetricCard label="Índice Reemplazo Bajas" value={`${avgIndiceReemplazo.toFixed(2)}%`} color="green" subValue="Cobertura promedio de las bajas" />
        <MetricCard label="Porcentaje Suspensiones" value={`${avgSuspensiones.toFixed(2)}%`} color="red" subValue="Promedio de suspensiones" />
        <MetricCard label="Tasa Winback Promedio" value={`${avgWinback.toFixed(2)}%`} color="yellow" subValue="Recuperación sobre inactivos" />
      </div>

      {/* FILA DE GRÁFICOS 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Evolución Churn Rate)">
          <Line data={churnChartData} options={baseLineOptions} />
        </ChartCard>

        <ChartCard title="Análisis de Crecimiento">
          <Bar data={crecimientoChartData} options={horizontalBarOptions} />
        </ChartCard>
      </div>

      {/* FILA DE GRÁFICOS 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Comportamiento de Reactivaciones">
          <Bar data={aporteReemplazoData} options={horizontalBarOptions} />
        </ChartCard>

        <ChartCard title="Balanza de Recuperaciones">
          <Line data={suspensionWinbackData} options={baseLineOptions} />
        </ChartCard>
      </div>

      {/* FILA DE GRÁFICOS 3: DONAS PONDERADAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Concentración % de Bajas por Zona" subtitle="Pasa el cursor para ver el Churn % de esa Zona">
          <Doughnut data={zonasChurnDoughnut} options={doughnutOptionsChurn} plugins={[centerTextPlugin, ChartDataLabels]} />
        </ChartCard>

        <ChartCard title="Concentración % de Ventas por Zona" subtitle="Pasa el cursor para ver el Crecimiento % de esa Zona">
          <Doughnut data={zonasCrecimientoDoughnut} options={doughnutOptionsCrecimiento} plugins={[centerTextPlugin, ChartDataLabels]} />
        </ChartCard>
      </div>
    </AppLayout>
  );
}