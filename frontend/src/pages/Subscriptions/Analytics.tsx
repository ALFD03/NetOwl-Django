import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { formatPeriodoLabel, PALETTE } from '@/utils/formatters';
import { Bar, Doughnut } from 'react-chartjs-2';
import { centerTextPlugin } from '@/components/Charts/plugins';
import { getHorizontalBarOptions, getDoughnutOptions, handleHover } from '@/components/Charts/chartOptions';
import { TrendingDown, TrendingUp, RefreshCw, DollarSign, Calendar, PieChart, BarChart3 } from 'lucide-react';
import ChartDataLabels from 'chartjs-plugin-datalabels';

interface DimensionVal {
  valor: string;
  activos_inicio: number;
  activos_final: number;
  nuevos: number;
  bajas: number;
  crecimiento: number;
  churn_neto_pct: number;
  churn_bruto_pct: number;
  corte_impagado: number;
  porcentaje_suspensiones: number;
  adiciones_netas: number;
  adiciones_brutas: number;
  reactivaciones: number;
  react_val: number;
  tasa_winback_pct: number;
  react_4_P: number;
  tasa_aporte_react_pct: number;
  indice_reemplazo_react_pct: number;
  arpu: number;
  total_billing: number;
}

interface DimensionGroup {
  periodo_reporte: string;
  dimensiones: Record<string, DimensionVal[]>;
}

interface Props {
  periodos: any[];
  dimensiones: DimensionGroup[];
}

export default function SubscriptionsAnalytics({ periodos = [], dimensiones = [] }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState(periodos[0]?.periodo_reporte || '');
  const [selectedDim, setSelectedDim] = useState<string>('zona');

  const [hNuevos, setHNuevos] = useState<{ name: string; val: string } | null>(null);
  const [hCrec, setHCrec] = useState<{ name: string; val: string } | null>(null);
  const [hWinback, setHWinback] = useState<{ name: string; val: string } | null>(null);
  const [hArpu, setHArpu] = useState<{ name: string; val: string } | null>(null);

  const globalData = useMemo(() => periodos.find(p => p.periodo_reporte === selectedPeriod) || {}, [selectedPeriod, periodos]);
  const dimGroup = useMemo(() => dimensiones.find(d => d.periodo_reporte === selectedPeriod)?.dimensiones || {}, [selectedPeriod, dimensiones]);
  const currentDimData = useMemo(() => dimGroup[selectedDim] || [], [dimGroup, selectedDim]);

  const dimLabels: Record<string, string> = { zona: 'Zona', sucursal: 'Sucursal', municipio: 'Municipio', campanna: 'Campaña', producto: 'Producto' };

  const getTopRanking = (data: DimensionVal[], key: keyof DimensionVal) => {
    const sorted = [...data].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
    return data.length > 15 ? sorted.slice(0, 10) : sorted;
  };

  const getDonutData = (key: keyof DimensionVal) => {
    const totalActivosEmpresa = globalData.activos_inicio || 1;
    const valGlobal = Number(globalData[key]) || 1;

    const items = currentDimData.map(d => {
      const valDim = Number(d[key]) || 0;
      const activosDim = d.activos_inicio || 1;
      const weight = (valDim / valGlobal) * (activosDim / totalActivosEmpresa) * 100;
      return { label: d.valor, weight, original: valDim };
    }).sort((a, b) => b.weight - a.weight);

    const majors = items.filter(i => i.weight >= 1);
    const othersWeight = items.filter(i => i.weight < 1).reduce((acc, i) => acc + i.weight, 0);

    return {
      labels: [...majors.map(m => m.label), ...(othersWeight > 0 ? ['Otros < 1%'] : [])],
      datasets: [{
        data: [...majors.map(m => Number(m.weight.toFixed(2))), ...(othersWeight > 0 ? [Number(othersWeight.toFixed(2))] : [])],
        backgroundColor: PALETTE,
        borderWidth: 2, borderColor: '#0f1a36'
      }],
      _raw: items
    };
  };

  return (
    <AppLayout title="Subscriptions Advanced Analytics">
      <SubHeader activeTab="analytics" />

      {/* 1. SECCIÓN DE FILTRO */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-0 shadow-2xl rounded-2xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
            <Calendar className="w-4 h-4 text-brand" />
            <span className="text-[11px] uppercase font-bold tracking-wider">Periodo</span>
          </div>
          <select 
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-sm font-semibold text-white cursor-pointer outline-none hover:bg-white/5"
          >
            {periodos.map(p => (
              <option key={p.periodo_reporte} value={p.periodo_reporte} className="bg-[#0f1a36] text-white">
                {formatPeriodoLabel(p.periodo_reporte)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center p-1.5 shadow-2xl rounded-2xl border border-slate-700/50 bg-[#0f1a36]">
          <div className="px-3 text-[10px] uppercase font-black text-slate-500 border-r border-slate-800 mr-1">Gráficos por</div>
          <div className="flex gap-1">
            {Object.entries(dimLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedDim(key)}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                  selectedDim === key 
                    ? 'bg-brand text-white shadow-md shadow-brand/20' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. SECCIÓN CARDS GRUPALES VIBRANTES */}
      <div className="space-y-8 mb-10">
        <div>
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" /> Grupo Pérdida
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Churn Neto" value={`${(globalData.churn_neto_pct || 0).toFixed(2)}%`} color="red" />
            <MetricCard label="Churn Bruto" value={`${(globalData.churn_bruto_pct || 0).toFixed(2)}%`} color="red" />
            <MetricCard label="Corte Impago" value={globalData.corte_impagado || 0} color="yellow" />
            <MetricCard label="% Suspensiones" value={`${(globalData.porcentaje_suspensiones || 0).toFixed(2)}%`} color="yellow" />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Grupo Ingresos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Nuevos" value={globalData.nuevos_mes || 0} color="green" />
            <MetricCard label="Adiciones Netas" value={globalData.adiciones_netas || 0} color="green" />
            <MetricCard label="Adiciones Brutas" value={globalData.adiciones_brutas || 0} color="blue" />
            <MetricCard label="Crecimiento" value={`${(globalData.crecimiento || 0).toFixed(2)}%`} color="blue" />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Grupo Retención
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="React. Totales" value={globalData.reactivaciones || 0} color="blue" />
            <MetricCard label="React. Ingreso" value={globalData.react_val || 0} color="blue" subValue="Peso en crecimiento" />
            <MetricCard label="Winback" value={`${(globalData.tasa_winback_pct || 0).toFixed(2)}%`} color="green" />
            <MetricCard label="Indice Reemplazo" value={`${(globalData.indice_reemplazo_react_pct || 0).toFixed(2)}%`} color="yellow" />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Grupo Financiero
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricCard label="ARPU" value={`$${globalData.arpu || 0}`} color="yellow" />
            <MetricCard label="Total Billing" value={`$${(globalData.total_billing || 0).toLocaleString()}`} color="green" />
          </div>
        </div>
      </div>

      {/* 3. SECCIÓN GRÁFICAS POR DIMENSIÓN CON NEONCONTAINER */}
      <div className="space-y-12">
        {/* PÉRDIDA */}
        <section>
          <div className="border-l-4 border-rose-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional de Pérdida</h2>
            <p className="text-xs text-slate-500">Basado en {dimLabels[selectedDim]}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <NeonContainer theme="red" title="Top Churn Neto %" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="h-72 w-full">
                <Bar 
                  data={{
                    labels: getTopRanking(currentDimData, 'churn_neto_pct').map(d => d.valor),
                    datasets: [{ label: '% Churn', data: getTopRanking(currentDimData, 'churn_neto_pct').map(d => d.churn_neto_pct.toFixed(2)), backgroundColor: '#ff2a5f', borderRadius: 6 }]
                  }}
                  options={getHorizontalBarOptions('#ff2a5f',' %')}
                />
              </div>
            </NeonContainer>

            <NeonContainer theme="red" title="Top Churn Bruto %" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="h-72 w-full">
                <Bar 
                  data={{
                    labels: getTopRanking(currentDimData, 'churn_bruto_pct').map(d => d.valor),
                    datasets: [{ label: '% Churn', data: getTopRanking(currentDimData, 'churn_bruto_pct').map(d => d.churn_bruto_pct.toFixed(2)), backgroundColor: '#e11d48', borderRadius: 6 }]
                  }}
                  options={getHorizontalBarOptions('#ff2a5f',' %')}
                />
              </div>
            </NeonContainer>

            <NeonContainer theme="yellow" title="Top % Suspensiones" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="h-72 w-full">
                <Bar 
                  data={{
                    labels: getTopRanking(currentDimData, 'porcentaje_suspensiones').map(d => d.valor),
                    datasets: [{ label: '% Suspensiones', data: getTopRanking(currentDimData, 'porcentaje_suspensiones').map(d => d.porcentaje_suspensiones.toFixed(2)), backgroundColor: '#f59e0b', borderRadius: 6 }]
                  }}
                  options={getHorizontalBarOptions('#f59e0b',' %')}
                />
              </div>
            </NeonContainer>
          </div>
        </section>

        {/* INGRESOS */}
        <section>
          <div className="border-l-4 border-emerald-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional de Ingresos</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <NeonContainer theme="green" title="Concentración de Clientes Nuevos" icon={<PieChart className="w-5 h-5" />}>
              <div className="h-72 w-full">
                {(() => {
                  const totalNuevosDim = currentDimData.reduce((acc, d) => acc + (d.nuevos || 0), 0);
                  const threshold = totalNuevosDim * 0.025;

                  const majors = currentDimData
                    .filter(d => (d.nuevos || 0) > threshold)
                    .sort((a, b) => (b.nuevos || 0) - (a.nuevos || 0));
                  
                  const othersSum = currentDimData
                    .filter(d => (d.nuevos || 0) <= threshold)
                    .reduce((acc, d) => acc + (d.nuevos || 0), 0);

                  const data = {
                    labels: [...majors.map(d => d.valor), ...(othersSum > 0 ? ['Otros (<2.5%)'] : [])],
                    datasets: [{
                      data: [...majors.map(d => d.nuevos), ...(othersSum > 0 ? [othersSum] : [])],
                      backgroundColor: PALETTE,
                      borderColor: '#0f1a36',
                      borderWidth: 2
                    }],
                    _raw: [...majors.map(d => ({ label: d.valor, original: d.nuevos })), ...(othersSum > 0 ? [{ label: 'Otros (<2.5%)', original: othersSum }] : [])]
                  };

                  return (
                    <Doughnut 
                      data={data} 
                      options={getDoughnutOptions({ title: hNuevos ? hNuevos.name : 'Total Nuevos', value: hNuevos ? hNuevos.val : String(globalData.nuevos_mes || 0), color: '#00ff88' }, handleHover(setHNuevos, data, ''))} 
                      plugins={[centerTextPlugin, ChartDataLabels]} 
                    />
                  );
                })()}
              </div>
            </NeonContainer>

            <NeonContainer theme="green" title="Ranking Adiciones Brutas" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="h-72 w-full">
                <Bar 
                  data={{
                    labels: getTopRanking(currentDimData, 'adiciones_brutas').map(d => d.valor),
                    datasets: [{ 
                      label: 'Cant.', 
                      data: getTopRanking(currentDimData, 'adiciones_brutas').map(d => d.adiciones_brutas),
                      backgroundColor: (ctx:any) => ctx.raw > 0 ? '#10b981' : '#f43f5e', 
                      borderRadius: 6
                    }]
                  }}
                  options={getHorizontalBarOptions('#ffffff','')}
                />
              </div>
            </NeonContainer>

            <NeonContainer theme="blue" title="Aporte al Crecimiento Global %" icon={<PieChart className="w-5 h-5" />}>
              <div className="h-72 w-full">
                {(() => {
                  const data = getDonutData('crecimiento');
                  return <Doughnut data={data} options={getDoughnutOptions({ title: hCrec ? `Crec. ${hCrec.name}` : 'Crec. Global', value: hCrec ? hCrec.val : `${(globalData.crecimiento || 0).toFixed(2)}%`, color: '#3b82f6' }, handleHover(setHCrec, data))} plugins={[centerTextPlugin, ChartDataLabels]} />
                })()}
              </div>
            </NeonContainer>
          </div>
        </section>

        {/* RETENCIÓN */}
        <section>
          <div className="border-l-4 border-blue-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional de Retención</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NeonContainer theme="green" title="Aporte a Tasa Winback" icon={<PieChart className="w-5 h-5" />}>
              <div className="h-72 w-full">
                {(() => {
                  const data = getDonutData('tasa_winback_pct');
                  return <Doughnut data={data} options={getDoughnutOptions({ title: hWinback ? `Winback ${hWinback.name}` : 'Winback Prom.', value: hWinback ? hWinback.val : `${(globalData.tasa_winback_pct || 0).toFixed(2)}%`, color: '#10b981' }, handleHover(setHWinback, data))} plugins={[centerTextPlugin, ChartDataLabels]} />
                })()}
              </div>
            </NeonContainer>

            <NeonContainer theme="blue" title="Ranking Tasa de Aporte Reactivación" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="h-72 w-full">
                <Bar 
                  data={{
                    labels: getTopRanking(currentDimData, 'tasa_aporte_react_pct').map(d => d.valor),
                    datasets: [{ label: '%', data: getTopRanking(currentDimData, 'tasa_aporte_react_pct').map(d => d.tasa_aporte_react_pct), backgroundColor: '#3b82f6', borderRadius: 6 }]
                  }}
                  options={getHorizontalBarOptions('#3b82f6',' %')}
                />
              </div>
            </NeonContainer>
          </div>
        </section>

        {/* FINANCIERO */}
        <section>
          <div className="border-l-4 border-amber-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional Financiero</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <NeonContainer theme="yellow" title="Aporte de ARPU por Dimensión" icon={<PieChart className="w-5 h-5" />}>
              <div className="h-72 w-full">
                {(() => {
                  const data = getDonutData('arpu');
                  return <Doughnut data={data} options={getDoughnutOptions({ title: hArpu ? `ARPU ${hArpu.name}` : 'ARPU Global', value: hArpu ? hArpu.val : `${(globalData.arpu || 0).toFixed(2)} $`, color: '#f59e0b' }, handleHover(setHArpu, data, ' $'))} plugins={[centerTextPlugin, ChartDataLabels]} />
                })()}
              </div>
            </NeonContainer>

            <NeonContainer theme="green" title="Ranking Facturación Total ($)" icon={<BarChart3 className="w-5 h-5" />}>
              <div className="h-72 w-full">
                <Bar 
                  data={{
                    labels: getTopRanking(currentDimData, 'total_billing').map(d => d.valor),
                    datasets: [{ label: 'USD', data: getTopRanking(currentDimData, 'total_billing').map(d => d.total_billing), backgroundColor: '#059669', borderRadius: 6 }]
                  }}
                  options={getHorizontalBarOptions('#10b981',' $')}
                />
              </div>
            </NeonContainer>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}