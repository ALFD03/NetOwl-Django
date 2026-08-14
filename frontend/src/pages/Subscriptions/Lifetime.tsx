import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { ChartCard } from '@/components/UI/ChartCard';
import { DataTable } from '@/components/UI/DataTable';
import { Line } from 'react-chartjs-2';
import { 
  Activity, MapPin, Building2, LayoutGrid, Package, Star, 
  Loader2, RefreshCw, Zap, Clock 
} from 'lucide-react';
import { PALETTE } from '@/utils/formatters';
import axios from 'axios';

export default function SubscriptionsLifetime({ lifecycle, dimensiones }: any) {
  const [loading, setLoading] = useState(false);
  // 1. CAMBIO: Ahora inicia por defecto en Sucursales
  const [activeTab, setActiveTab] = useState<string>('sucursal');

  const data = useMemo(() => lifecycle || {}, [lifecycle]);
  const dims = useMemo(() => dimensiones || {}, [dimensiones]);
  
  const f0 = (v: any) => {
    const n = Number(v);
    return isNaN(n) ? "0" : Math.floor(n).toLocaleString('en-US');
  };

  const dimLabels: any = {
    sucursal: { label: 'Sucursales', icon: Building2 },
    zona: { label: 'Zonas', icon: MapPin },
    municipio: { label: 'Municipios', icon: LayoutGrid },
    producto: { label: 'Productos', icon: Package },
    campanna: { label: 'Campañas', icon: Star },
  };

  // --- LÓGICA DE GRÁFICA COMPARATIVA ---
  const comparisonChartData = useMemo(() => {
    const currentDimSet = dims[activeTab] || {};
    // Tomamos todas las sucursales (o elementos de la dimensión)
    const topValues = Object.entries(currentDimSet)
      .map(([name, info]: any) => ({ name, ...info }))
      .filter(i => i.n_total_activo > 5) // Muestra mínima para evitar líneas vacías
      .sort((a, b) => (b.mediana_activo || 0) - (a.mediana_activo || 0));

    return {
      labels: data.curva_activo?.map((p: any) => `${p.tiempo}d`) || [],
      datasets: [
        {
          label: 'Promedio Empresa',
          data: data.curva_activo?.map((p: any) => (p.sup * 100).toFixed(1)),
          borderColor: '#ffffff',
          borderWidth: 4,
          pointRadius: 0,
          fill: false,
          borderDash: [5, 5],
          stepped: true, // Kaplan-Meier es una función escalonada
          zIndex: 50
        },
        ...topValues.map((v, idx) => ({
          label: v.name,
          data: v.curva_activo?.map((p: any) => (p.sup * 100).toFixed(1)),
          borderColor: PALETTE[idx % PALETTE.length],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          stepped: true,
          tension: 0,
          hidden: idx > 9 // Ocultar por defecto si hay más de 10 para no saturar, pero el usuario puede activarlas
        }))
      ]
    };
  }, [data, dims, activeTab]);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { 
        display: true, 
        position: 'bottom',
        labels: { color: '#94a3b8', boxWidth: 10, font: { size: 9 }, padding: 15 } 
      },
      // CRÍTICO: Desactivamos el plugin de etiquetas para que no se vea la mancha gris
      datalabels: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        padding: 12,
        cornerRadius: 8,
        callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw}%` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 12 } },
      y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', callback: (v: any) => v + '%' } },
    }
  };

  const handleRun = async () => {
    setLoading(true);
    try { await axios.post('/subscriptions/api/lifecycle/run/'); window.location.reload(); }
    catch (e) { setLoading(false); }
  };

  // Cálculo de censura manual para evitar NaN si el backend no lo envía directo
  const calculatedCensorship = useMemo(() => {
    const total = Number(data.n_total_activo || data.total_suscriptores || 0);
    const censurados = Number(data.n_censurado_activo || 0);
    if (total === 0) return "0.0";
    return ((censurados / total) * 100).toFixed(1);
  }, [data]);

  return (
    <AppLayout title="Life Time Cycle (Supervivencia)">
      <SubHeader activeTab="lifetime" />

      <div className="space-y-6">
        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard label="Vida Media (50%)" value={`${f0(data.mediana_activo)} días`} color="blue" subValue="Expectativa de permanencia" />
          <MetricCard label="Supervivencia 1er Año" value={`${(data.curva_activo?.find((p: any) => p.tiempo >= 365)?.sup * 100 || 0).toFixed(1)}%`} color="green" />
          <MetricCard label="Tasa de Censura" value={`${calculatedCensorship}%`} color="yellow" subValue="Clientes que no han cancelado" />
          <MetricCard label="Muestra Total" value={f0(data.n_total_activo || data.total_suscriptores)} color="slate" subValue="Histórico analizado" />
        </div>

        {/* GRÁFICA Y TIMELINE */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-surface-secondary border border-slate-800 rounded-3xl p-6 shadow-xl h-full flex flex-col">
              <h5 className="text-white font-black text-xs uppercase tracking-widest mb-8 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand" /> Timeline de Deserción
              </h5>
              <div className="space-y-8 relative flex-1">
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-800" />
                {[
                  { label: 'Baja Temprana (25%)', days: data.p25_activo, color: 'bg-rose-500' },
                  { label: 'Punto Crítico (50%)', days: data.mediana_activo, color: 'bg-brand' },
                  { label: 'Fidelización (75%)', days: data.p75_activo, color: 'bg-emerald-500' }
                ].map((hito, i) => (
                  <div key={i} className="relative pl-10">
                    <div className={`absolute left-0 top-1 w-6 h-6 rounded-full ${hito.color} border-4 border-[#0b1326] z-10`} />
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{hito.label}</p>
                    <p className="text-xl font-black text-white">{f0(hito.days)} <span className="text-xs font-normal text-slate-400">días</span></p>
                  </div>
                ))}
              </div>
              <button onClick={handleRun} disabled={loading} className="mt-8 w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Actualizar Motor KM
              </button>
            </div>
          </div>

          <div className="lg:col-span-3">
            <ChartCard title={`Análisis de Supervivencia: ${dimLabels[activeTab].label}`}>
              <div className="h-full">
                <Line data={comparisonChartData} options={chartOptions} />
              </div>
            </ChartCard>
          </div>
        </div>

        {/* TABLA */}
        <section className="bg-surface-secondary border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
            <h4 className="text-white font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand" /> Rendimiento por {dimLabels[activeTab].label}
            </h4>
            <div className="flex gap-1 bg-surface-tertiary p-1 rounded-xl border border-slate-700">
              {Object.entries(dimLabels).map(([k, v]: any) => (
                <button key={k} onClick={() => setActiveTab(k)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === k ? 'bg-brand text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                  <v.icon className="w-3 h-3" /> {v.label}
                </button>
              ))}
            </div>
          </div>
          <DataTable 
            columns={[
              { 
                header: 'Etiqueta', 
                accessor: (r: any) => <span className="font-bold text-white sticky left-0 bg-[#0f1a36] z-10 pr-4 min-w-[140px] block">{r.valor}</span>,
                sortKey: 'valor'
              },
              { 
                header: 'Muestra Total', 
                accessor: (r: any) => <span className="text-slate-300">{f0(r.n_total_activo)}</span>, 
                align: 'right',
                sortKey: 'n_total_activo'
              },
              { 
                header: 'Baja Temprana (P25)', 
                accessor: (r: any) => <span className="text-slate-400">{f0(r.p25_activo)} d</span>, 
                align: 'right',
                sortKey: 'p25_activo'
              },
              { 
                header: 'Vida Media (P50)', 
                accessor: (r: any) => (
                  <div className="flex items-center justify-end gap-3">
                    <span className="text-blue-400 font-black">{f0(r.mediana_activo)} d</span>
                    <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden hidden xl:block">
                      <div 
                        className="h-full bg-brand" 
                        style={{ width: `${Math.min((r.mediana_activo / 400) * 100, 100)}%` }} 
                      />
                    </div>
                  </div>
                ),
                align: 'right',
                sortKey: 'mediana_activo'
              },
              { 
                header: 'Fidelización (P75)', 
                accessor: (r: any) => <span className="text-emerald-400 font-medium">{f0(r.p75_activo)} d</span>, 
                align: 'right',
                sortKey: 'p75_activo'
              },
              { 
                header: 'Tasa Reactivación', 
                accessor: (r: any) => r.mediana_reactivacion ? (
                  <span className="text-amber-400">{f0(r.mediana_reactivacion)} d</span>
                ) : (
                  <span className="text-slate-600">--</span>
                ), 
                align: 'right',
                sortKey: 'mediana_reactivacion'
              }
            ]}
            data={Object.entries(dims[activeTab] || {}).map(([valor, info]: any) => ({ valor, ...info }))}
            searchable
            searchPlaceholder={`Buscar en ${dimLabels[activeTab].label}...`}
          />
        </section>
      </div>
    </AppLayout>
  );
}