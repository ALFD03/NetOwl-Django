import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { NeonContainer } from '@/components/UI/NeonContainer';
import { Link } from '@inertiajs/react';
import { formatPeriodoLabel } from '@/utils/formatters';
import { 
  Lock, Unlock, ShieldAlert, Calendar, ChevronDown, Wifi, Tv, 
  Gauge, Loader2, Database, MapPin, Users, Activity, Zap, Building2, 
  Settings, ChevronRight, LayoutGrid, Info
} from 'lucide-react';
import axios from 'axios';

interface Props {
  etaData: any;
}

const f0 = (val: any) => {
  const num = Number(val);
  if (isNaN(num)) return "0";
  return Math.floor(num).toLocaleString('en-US');
};

export default function EtaReport({ etaData: initialData }: Props) {
  const [data, setData] = useState<any>(initialData || {});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(initialData?.periodo || '');

  const fetchReport = async (period: string, force = false) => {
    setLoading(true);
    try {
      const res = await axios.get(`/subscriptions/api/eta-report/data/`, { 
        params: { period, force } 
      });
      setData(res.data);
    } catch (e) {
      console.error("Error cargando reporte ETA:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPeriod && selectedPeriod !== data.periodo) {
      fetchReport(selectedPeriod);
    }
  }, [selectedPeriod]);

  const toggleLock = async () => {
    setSaving(true);
    try {
      await axios.post('/subscriptions/api/eta-report/lock/', { 
        period: data.periodo, 
        lock: !data.esta_bloqueado 
      });
      fetchReport(selectedPeriod, true);
    } finally {
      setSaving(false);
    }
  };

  // Componente interno para matrices de desglose con estilo Neon
  const RenderStatGroup = ({ title, icon: Icon, stats, theme = "blue" }: any) => (
    <NeonContainer
      theme={theme}
      title={title}
      icon={<Icon className="w-4 h-4" />}
      className="h-full"
    >
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
        {Object.entries(stats || {}).length > 0 ? (
          Object.entries(stats).map(([label, val]: any) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-slate-800/60 last:border-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase truncate pr-4" title={label}>
                {label}
              </span>
              <span className="text-xs font-black text-white font-mono">
                {f0(val)}
              </span>
            </div>
          ))
        ) : (
          <div className="text-[10px] text-slate-600 italic py-6 text-center">Sin registros</div>
        )}
      </div>
    </NeonContainer>
  );

  return (
    <AppLayout title="Reporte Regulatorio ETA">
      <SubHeader activeTab="eta" />

      {/* 1. BARRA DE CONTROL SUPERIOR */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4 items-center">
          <div className="flex items-center shadow-2xl rounded-2xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border-r border-slate-700/50 text-slate-400">
              <Calendar className="w-4 h-4 text-brand" />
              <span className="text-[10px] uppercase font-black tracking-wider">Mes Reporte</span>
            </div>
            <div className="relative group">
              <select 
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="appearance-none bg-transparent pl-4 pr-10 py-2.5 text-xs font-bold text-white cursor-pointer outline-none hover:bg-white/5"
              >
                {data.periods?.map((p: string) => (
                  <option key={p} value={p} className="bg-[#0f1a36]">{formatPeriodoLabel(p)}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
            </div>
          </div>

          <Link 
            href={`/subscriptions/eta-report/config/?period=${selectedPeriod}`} 
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-2xl border border-slate-700 font-bold text-[10px] uppercase tracking-widest transition-all shadow-lg"
          >
            <Settings className="w-4 h-4 text-brand" /> Gestionar Maestro
          </Link>
        </div>

        {data.status === 'success' && (
          <button 
            onClick={toggleLock}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl ${
              data.esta_bloqueado 
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-emerald-500/20'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (data.esta_bloqueado ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />)}
            {data.esta_bloqueado ? 'Reporte Bloqueado' : 'Cerrar y Bloquear Mes'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-20 text-center">
          <Loader2 className="w-12 h-12 text-brand animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Calculando matrices regulatorias...</p>
        </div>
      ) : data.status === 'unmapped_elements' ? (
        /* ESTADO BLOQUEANTE */
        <div className="bg-surface-secondary border border-amber-500/30 rounded-[2.5rem] p-12 text-center shadow-2xl max-w-4xl mx-auto flex flex-col items-center animate-in zoom-in duration-300">
          <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mb-6 border border-amber-500/30 shadow-inner">
            <ShieldAlert className="w-10 h-10 text-amber-400" />
          </div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-3">Clasificación Requerida</h3>
          <p className="text-slate-400 max-w-md mb-8 font-medium leading-relaxed text-xs">
            Se han detectado <strong>{(data.unmapped_plans?.length || 0) + (data.unmapped_subs?.length || 0)}</strong> servicios nuevos o corporativos sin categoría regulatoria para {formatPeriodoLabel(selectedPeriod)}.
          </p>
          <Link 
            href={`/subscriptions/eta-report/config/?period=${selectedPeriod}`} 
            className="bg-amber-500 hover:bg-amber-400 text-[#0b1326] px-10 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-amber-500/30 flex items-center gap-2 transition-all"
          >
            Ir a Panel de Clasificación <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : data.status === 'success' ? (
        /* DASHBOARD REGULATORIO COMPLETO */
        <div className="space-y-10 pb-20 animate-in fade-in duration-500">
          
          {/* Fila 1: KPIs VIBRANTES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard label="Muestra Internet" value={f0(data.net_metrics?.total)} color="blue" subValue="Conexiones fijas" icon={<Wifi className="w-4 h-4 text-sky-400" />} />
            <MetricCard label="Transporte de Datos" value={f0(data.transporte_metrics)} color="yellow" subValue="Circuitos L2 / P2P" icon={<Activity className="w-4 h-4 text-amber-400" />} />
            <MetricCard label="Muestra TV" value={f0(data.tv_metrics?.total)} color="green" subValue="Suscripciones" icon={<Tv className="w-4 h-4 text-emerald-400" />} />
            <MetricCard label="Universo Total" value={f0(data.total_muestreado)} color="slate" subValue="Cierre auditado" icon={<Database className="w-4 h-4 text-slate-300" />} />
            <MetricCard label="Especializados" value={f0(data.individual_configs?.length)} color="purple" subValue="Maestro guardado" icon={<Zap className="w-4 h-4 text-purple-400" />} />
          </div>

          {/* Fila 2: Servicio de Internet */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-sky-500 pl-4">
              <Wifi className="w-6 h-6 text-sky-400" />
              <div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Servicio de Internet</h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Cruces de variables para reporte nacional</p>
              </div>
            </div>
            
            {/* Desgloses Simples */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <RenderStatGroup title="1. Por Tecnología" icon={Activity} stats={data.net_metrics?.por_tecnologia} theme="blue" />
              <RenderStatGroup title="2. Por Tipo Persona" icon={Users} stats={data.net_metrics?.por_persona} theme="blue" />
              <RenderStatGroup title="3. Por Estado" icon={MapPin} stats={data.net_metrics?.por_estado} theme="blue" />
              <RenderStatGroup title="4. Tecnología | Persona" icon={Zap} stats={data.net_metrics?.por_tecnologia_persona} theme="blue" />
            </div>

            {/* Desgloses Complejos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <RenderStatGroup title="5. Estado | Tecnología" icon={LayoutGrid} stats={data.net_metrics?.por_estado_tecnologia} theme="cyan" />
              <RenderStatGroup title="6. Estado | Persona" icon={Building2} stats={data.net_metrics?.por_estado_persona} theme="cyan" />
              <RenderStatGroup title="7. Matriz: Estado | Tec | Persona" icon={Database} stats={data.net_metrics?.por_estado_tecnologia_persona} theme="cyan" />
            </div>
          </section>

          {/* Fila 3: TV y Penetración de Velocidades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Servicio de TV */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 border-l-4 border-emerald-500 pl-4">
                <Tv className="w-6 h-6 text-emerald-400" />
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Servicio de TV</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <RenderStatGroup title="1. Por Estado" icon={MapPin} stats={data.tv_metrics?.por_estado} theme="green" />
                <RenderStatGroup title="2. Por Tipo Persona" icon={Users} stats={data.tv_metrics?.por_persona} theme="green" />
              </div>
              <RenderStatGroup title="3. Estado | Persona" icon={LayoutGrid} stats={data.tv_metrics?.por_estado_persona} theme="green" />
            </section>

            {/* Penetración de Velocidades */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 border-l-4 border-amber-500 pl-4">
                <Gauge className="w-6 h-6 text-amber-400" />
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Penetración Velocidades</h2>
              </div>
              
              <NeonContainer
                theme="yellow"
                title="Distribución de Velocidades (Mbps)"
                subtitle="Basado en configuración oficial de Planes.json"
                icon={<Gauge className="w-5 h-5" />}
                noPadding={true}
              >
                <table className="w-full text-left text-[11px] text-slate-300 uppercase font-black border-collapse">
                  <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-4 border-r border-slate-800/80">Rango de Bajada</th>
                      <th className="p-4 text-right">Alámbrico</th>
                      <th className="p-4 text-right">Inalámbrico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {Object.entries(data.speed_metrics || {}).map(([rango, techs]: any) => (
                      <tr key={rango} className="hover:bg-white/5 transition-colors">
                        <td className="p-4 text-slate-300 font-bold border-r border-slate-800/80">{rango}</td>
                        <td className="p-4 text-right text-white font-mono font-black">{f0(techs.Alámbrico)}</td>
                        <td className="p-4 text-right text-white font-mono font-black">{f0(techs.Inalámbrico)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </NeonContainer>
            </section>
          </div>

        </div>
      ) : (
        /* ESTADO VACÍO */
        <div className="p-20 text-center bg-surface-secondary rounded-3xl border border-dashed border-slate-800">
          <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-white font-bold text-lg uppercase tracking-widest">Información no disponible</h3>
          <p className="text-slate-500 max-w-sm mx-auto mt-2 text-xs">
            No se encontró un cierre de activos para {formatPeriodoLabel(selectedPeriod)}. Asegúrate de haber ejecutado el análisis mensual.
          </p>
        </div>
      )}
    </AppLayout>
  );
}