import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { ChartCard } from '@/components/UI/ChartCard';
import { formatPeriodoLabel, PALETTE } from '@/utils/formatters';
import { Bar, Doughnut } from 'react-chartjs-2';
import { centerTextPlugin } from '@/components/Charts/plugins';
import { getHorizontalBarOptions, getDoughnutOptions, handleHover } from '@/components/Charts/chartOptions';
import { TrendingDown, TrendingUp, RefreshCw, DollarSign, Calendar, Target } from 'lucide-react';
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
//! ---------- Estados ----------
  const [selectedPeriod, setSelectedPeriod] = useState(periodos[0]?.periodo_reporte || '');
  const [selectedDim, setSelectedDim] = useState<string>('zona');

  //? ----------- Estados para hover de donas -----------
  const [hNuevos, setHNuevos] = useState<{ name: string; val: string } | null>(null);
  const [hCrec, setHCrec] = useState<{ name: string; val: string } | null>(null);
  const [hWinback, setHWinback] = useState<{ name: string; val: string } | null>(null);
  const [hArpu, setHArpu] = useState<{ name: string; val: string } | null>(null);

  const globalData = useMemo(() => periodos.find(p => p.periodo_reporte === selectedPeriod) || {}, [selectedPeriod, periodos]);
  const dimGroup = useMemo(() => dimensiones.find(d => d.periodo_reporte === selectedPeriod)?.dimensiones || {}, [selectedPeriod, dimensiones]);
  const currentDimData = useMemo(() => dimGroup[selectedDim] || [], [dimGroup, selectedDim]);

  const dimLabels: Record<string, string> = { zona: 'Zona', sucursal: 'Sucursal', municipio: 'Municipio', campanna: 'Campaña', producto: 'Producto' };

//! ----------- logica de rankings -----------
  const getTopRanking = (data: DimensionVal[], key: keyof DimensionVal) => {
    const sorted = [...data].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
    return data.length > 15 ? sorted.slice(0, 10) : sorted;
  };

  const getTopBottom = (data: DimensionVal[], key: keyof DimensionVal) => {
    if (data.length <= 15) return [...data].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
    const sorted = [...data].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
    return [...sorted.slice(0, 5), ...sorted.slice(-5)];
  };

//! ---------- Generador de datos y calculo de peso ----------
  const getDonutData = (key: keyof DimensionVal, isPct = false, prefix = '') => {
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

  //! ---------- Renderizado de elementos ----------
  return (
    <AppLayout title="Subscriptions Advanced Analytics">
      <SubHeader activeTab="analytics" />

      {/* 1. SECCIÓN DE FILTRO */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
  <div className="flex items-center gap-0 shadow-2xl rounded-xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
    {/* Etiqueta lateral tipo 'Tag' */}
    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
      <Calendar className="w-4 h-4 text-brand" />
      <span className="text-[11px] uppercase font-bold tracking-wider">Periodo</span>
    </div>

    {/* Select estilizado */}
    <div className="relative group">
      <select 
        value={selectedPeriod}
        onChange={(e) => setSelectedPeriod(e.target.value)}
        className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-sm font-semibold text-white cursor-pointer outline-none focus:ring-2 focus:ring-brand/50 transition-all hover:bg-white/5"
      >
        {periodos.map(p => (
          <option key={p.periodo_reporte} value={p.periodo_reporte} className="bg-[#0f1a36] text-white">
            {formatPeriodoLabel(p.periodo_reporte)}
          </option>
        ))}
      </select>
      {/* Icono de flecha personalizado */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-brand transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-9"/></svg>
      </div>
    </div>
  </div>

  {/* Selector de Dimensiones con estilo similar */}
  <div className="flex items-center p-1 shadow-2xl rounded-xl border border-slate-700/50 bg-[#0f1a36]">
    <div className="px-3 text-[10px] uppercase font-black text-slate-500 border-r border-slate-800 mr-1">Gráficos por</div>
    <div className="flex gap-1">
        {Object.entries(dimLabels).map(([key, label]) => (
            <button
                key={key}
                onClick={() => setSelectedDim(key)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
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

      {/* 2. SECCIÓN CARDS GRUPALES */}
      <div className="space-y-8 mb-10">
        {/* GRUPO PÉRDIDA */}
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

        {/* GRUPO INGRESOS */}
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

        {/* GRUPO RETENCIÓN */}
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

        {/* GRUPO FINANCIERO */}
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

      {/* 3. SECCIÓN GRÁFICAS POR DIMENSIÓN */}
      <div className="space-y-12">
        
        {/* DIMENSIONES: PÉRDIDA */}
        <section>
          <div className="border-l-4 border-rose-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional de Pérdida</h2>
            <p className="text-xs text-slate-500">Basado en {dimLabels[selectedDim]}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard title="Top Churn Neto %">
              <Bar 
                data={{
                  labels: getTopRanking(currentDimData, 'churn_neto_pct').map(d => d.valor),
                  datasets: [{ label: '% Churn', data: getTopRanking(currentDimData, 'churn_neto_pct').map(d => d.churn_neto_pct.toFixed(2)), backgroundColor: '#ff2a5f', borderRadius: 6 }]
                }}
                options={getHorizontalBarOptions('#ff2a5f',' %')}
              />
            </ChartCard>
            <ChartCard title="Top Churn Bruto %">
              <Bar 
                data={{
                  labels: getTopRanking(currentDimData, 'churn_bruto_pct').map(d => d.valor),
                  datasets: [{ label: '% Churn', data: getTopRanking(currentDimData, 'churn_bruto_pct').map(d => d.churn_bruto_pct.toFixed(2)), backgroundColor: '#e11d48', borderRadius: 6 }]
                }}
                options={getHorizontalBarOptions('#ff2a5f',' %')}
              />
            </ChartCard>
            <ChartCard title="Top % Suspensiones">
              <Bar 
                data={{
                  labels: getTopRanking(currentDimData, 'porcentaje_suspensiones').map(d => d.valor),
                  datasets: [{ label: '% Suspensiones', data: getTopRanking(currentDimData, 'porcentaje_suspensiones').map(d => d.porcentaje_suspensiones.toFixed(2)), backgroundColor: '#f59e0b', borderRadius: 6 }]
                }}
                options={getHorizontalBarOptions('#f59e0b',' %')}
              />
            </ChartCard>
          </div>
        </section>

        {/* DIMENSIONES: INGRESOS */}
        <section>
          <div className="border-l-4 border-emerald-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional de Ingresos</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard title="Concentración de Clientes Nuevos">
              {(() => {
                const totalNuevosDim = currentDimData.reduce((acc, d) => acc + (d.nuevos || 0), 0);
                const threshold = totalNuevosDim * 0.025;

                const majors = currentDimData
                  .filter(d => (d.nuevos || 0) > threshold)
                  .sort((a, b) => (b.nuevos || 0) - (a.nuevos || 0));
                
                const othersSum = currentDimData
                  .filter(d => (d.nuevos || 0) <= threshold)
                  .reduce((acc, d) => acc + (d.nuevos || 0), 0);

                const finalLabels = majors.map(d => d.valor);
                const finalValues = majors.map(d => d.nuevos);
                const rawForHover = majors.map(d => ({ label: d.valor, original: d.nuevos }));

                if (othersSum > 0) {
                  finalLabels.push('Otros (<2.5%)');
                  finalValues.push(othersSum);
                  rawForHover.push({ label: 'Otros (<2.5%)', original: othersSum });
                }

                const data = {
                  labels: finalLabels,
                  datasets: [{
                    data: finalValues,
                    backgroundColor: PALETTE,
                    borderColor: '#0f1a36',
                    borderWidth: 2
                  }],
                  _raw: rawForHover
                };

                const options = {
                  ...getDoughnutOptions(
                    { 
                      title: hNuevos ? hNuevos.name : 'Total Nuevos', 
                      value: hNuevos ? hNuevos.val : (globalData.nuevos_mes || 0), 
                      color: '#00ff88' 
                    }, 
                    handleHover(setHNuevos, data, '')
                  ),
                  plugins: {
                    ...getDoughnutOptions({
                      title: '',
                      value: '',
                      color: ''
                    }, () => {}).plugins,
                    datalabels: {
                      display: true,
                      color: '#fff',
                      font: { weight: 'bold', size: 10 },
                      formatter: (value: number) => {
                        const percentage = (value / totalNuevosDim) * 100;
                        return percentage > 1 ? percentage.toFixed(1) + '%' : '';
                      }
                    },
                    tooltip: { enabled: false }
                  }
                };

                return (
                  <Doughnut 
                    data={data} 
                    options={options} 
                    plugins={[centerTextPlugin, ChartDataLabels]} 
                  />
                );
              })()}
            </ChartCard>
            <ChartCard title="Ranking Adiciones Brutas">
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
                options={getHorizontalBarOptions('#ffffffff','')}
              />
            </ChartCard>
            <ChartCard title="Aporte al Crecimiento Global %">
                {(() => {
                    const data = getDonutData('crecimiento', true);
                    return <Doughnut data={data} options={getDoughnutOptions({ title: hCrec ? `Crec. ${hCrec.name}` : 'Crec. Global', value: hCrec ? hCrec.val : `${(globalData.crecimiento || 0).toFixed(2)}%`, color: '#3b82f6' }, handleHover(setHCrec, data))} plugins={[centerTextPlugin, ChartDataLabels]} />
                })()}
            </ChartCard>
          </div>
        </section>

        {/* DIMENSIONES: RETENCIÓN */}
        <section>
          <div className="border-l-4 border-blue-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional de Retención</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Aporte a Tasa Winback">
                {(() => {
                    const data = getDonutData('tasa_winback_pct', true);
                    return <Doughnut data={data} options={getDoughnutOptions({ title: hWinback ? `Winback ${hWinback.name}` : 'Winback Prom.', value: hWinback ? hWinback.val : `${(globalData.tasa_winback_pct || 0).toFixed(2)}%`, color: '#10b981' }, handleHover(setHWinback, data))} plugins={[centerTextPlugin, ChartDataLabels]} />
                })()}
            </ChartCard>
            <ChartCard title="Ranking Tasa de Aporte Reactivación">
              <Bar 
                data={{
                  labels: getTopRanking(currentDimData, 'tasa_aporte_react_pct').map(d => d.valor),
                  datasets: [{ label: '%', data: getTopRanking(currentDimData, 'tasa_aporte_react_pct').map(d => d.tasa_aporte_react_pct), backgroundColor: '#3b82f6', borderRadius: 6 }]
                }}
                options={getHorizontalBarOptions('#3b82f6',' %')}
              />
            </ChartCard>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <ChartCard title="Ranking Índice de Reemplazo">
              <Bar 
                data={{
                  labels: getTopRanking(currentDimData, 'indice_reemplazo_react_pct').map(d => d.valor),
                  datasets: [{ label: '%', data: getTopRanking(currentDimData, 'indice_reemplazo_react_pct').map(d => d.indice_reemplazo_react_pct), backgroundColor: '#8b5cf6', borderRadius: 6 }]
                }}
                options={getHorizontalBarOptions('#8b5cf6',' %')}
              />
            </ChartCard>
            <ChartCard title="Recuperados de Suspensión (Absolutos)">
              <Bar 
                data={{
                  labels: getTopRanking(currentDimData, 'react_4_P').map(d => d.valor),
                  datasets: [{ label: 'Clientes', data: getTopRanking(currentDimData, 'react_4_P').map(d => d.react_4_P), backgroundColor: '#10b981', borderRadius: 6 }]
                }}
                options={getHorizontalBarOptions('#10b981','')}
              />
            </ChartCard>
          </div>
        </section>

        {/* DIMENSIONES: FINANCIERO */}
        <section>
          <div className="border-l-4 border-amber-500 pl-4 mb-6">
            <h2 className="text-lg font-bold text-white">Análisis Dimensional Financiero</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Aporte de ARPU por Dimensión">
                {(() => {
                    const data = getDonutData('arpu', false);
                    return <Doughnut data={data} options={getDoughnutOptions({ title: hArpu ? `ARPU ${hArpu.name}` : 'ARPU Global', value: hArpu ? hArpu.val : `${(globalData.arpu || 0).toFixed(2)} $`, color: '#f59e0b' }, handleHover(setHArpu, data, ' $'))} plugins={[centerTextPlugin, ChartDataLabels]} />
                })()}
            </ChartCard>
            <ChartCard title="Ranking Facturación Total ($)">
              <Bar 
                data={{
                  labels: getTopRanking(currentDimData, 'total_billing').map(d => d.valor),
                  datasets: [{ label: 'USD', data: getTopRanking(currentDimData, 'total_billing').map(d => d.total_billing), backgroundColor: '#059669', borderRadius: 6 }]
                }}
                options={getHorizontalBarOptions('#10b981',' $')}
              />
            </ChartCard>
          </div>
        </section>

      </div>
    </AppLayout>
  );
}