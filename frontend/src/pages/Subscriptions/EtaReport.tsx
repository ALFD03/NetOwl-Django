import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { MetricCard } from '@/components/UI/MetricCard';
import { Link } from '@inertiajs/react';
import { formatPeriodoLabel } from '@/utils/formatters';
import { 
  Lock, Unlock, ShieldAlert, Calendar, ChevronDown, Wifi, Tv, 
  Gauge, Loader2, Database, MapPin, Users, Activity, Zap, Building2, 
  Settings, ChevronRight, LayoutGrid, CheckCircle2, Info
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

  // --- RECARGA DE DATOS ---
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

  // --- ACCIÓN DE BLOQUEO ---
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

  // --- COMPONENTE DE CELDA DE DATOS ---
  const RenderStatGroup = ({ title, icon: Icon, stats, color = "brand" }: any) => (
    <div className="bg-surface-secondary border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col h-full transition-all hover:border-slate-700">
      <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex items-center gap-2">
        <Icon className={`w-4 h-4 text-${color}`} />
        <h4 className="text-[10px] font-black text-white uppercase tracking-widest">{title}</h4>
      </div>
      <div className="p-4 space-y-2 flex-1 max-h-[350px] overflow-y-auto custom-scrollbar">
        {Object.entries(stats || {}).length > 0 ? (
          Object.entries(stats).map(([label, val]: any) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase truncate pr-4" title={label}>{label}</span>
              <span className="text-xs font-black text-white">{f0(val)}</span>
            </div>
          ))
        ) : (
          <div className="text-[10px] text-slate-600 italic py-4 text-center">Sin registros</div>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout title="Reporte Regulatorio ETA">
      <SubHeader activeTab="eta" />

      {/* 1. BARRA DE CONTROL SUPERIOR */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4 items-center">
            <div className="flex items-center shadow-2xl rounded-xl border border-slate-700/50 bg-[#0f1a36] overflow-hidden">
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
                href="/subscriptions/eta-report/config/" 
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 font-bold text-[10px] uppercase tracking-widest transition-all"
            >
                <Settings className="w-4 h-4" /> Gestionar Maestro
            </Link>
        </div>

        {data.status === 'success' && (
            <button 
                onClick={toggleLock}
                disabled={saving}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl ${
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
        <div className="p-20 text-center"><Loader2 className="w-12 h-12 text-brand animate-spin mx-auto mb-4" /><p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Calculando matrices...</p></div>
      ) : data.status === 'unmapped_elements' ? (
        /* ESTADO BLOQUEANTE: FALTAN CLASIFICACIONES */
        <div className="bg-surface-secondary border border-slate-800 rounded-[2.5rem] p-12 text-center shadow-2xl max-w-4xl mx-auto flex flex-col items-center animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center mb-8 border border-amber-500/20 shadow-inner">
                <ShieldAlert className="w-12 h-12 text-amber-500" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Clasificación Requerida</h3>
            <p className="text-slate-500 max-w-md mb-10 font-medium leading-relaxed">
                Se han detectado <strong>{(data.unmapped_plans?.length || 0) + (data.unmapped_subs?.length || 0)}</strong> servicios nuevos o corporativos que no tienen asignada una categoría regulatoria para {formatPeriodoLabel(selectedPeriod)}.
            </p>
            <Link 
                href="/subscriptions/eta-report/config/" 
                className="bg-amber-500 hover:bg-amber-400 text-[#0b1326] px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-amber-500/40 flex items-center gap-3 transition-all scale-110"
            >
                Ir a Panel de Clasificación <ChevronRight className="w-5 h-5" />
            </Link>
        </div>
      ) : data.status === 'success' ? (
        /* ESTADO ÉXITO: MOSTRAR DASHBOARD COMPLETO */
        <div className="space-y-12 animate-in fade-in duration-700 pb-20">
          
          {/* Fila 1: KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Muestra Internet" value={f0(data.net_metrics?.total)} color="blue" subValue="Conexiones fijas" />
            <MetricCard label="Muestra TV" value={f0(data.tv_metrics?.total)} color="green" subValue="Suscripciones" />
            <MetricCard label="Universo Total" value={f0(data.total_muestreado)} color="blue" subValue="Cierre auditado" />
            <MetricCard label="Especializados" value={f0(data.individual_configs?.length)} color="yellow" subValue="Maestro guardado" />
          </div>

          {/* Fila 2: Internet (7 Desgloses) */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-brand pl-4">
                <Wifi className="w-6 h-6 text-brand" />
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Servicio de Internet</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Cruces de variables para reporte nacional</p>
                </div>
            </div>
            
            {/* Grid 4 columnas: Desgloses Simples */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <RenderStatGroup title="1. Por Tecnología" icon={Activity} stats={data.net_metrics?.por_tecnologia} />
              <RenderStatGroup title="2. Por Tipo Persona" icon={Users} stats={data.net_metrics?.por_persona} />
              <RenderStatGroup title="3. Por Estado" icon={MapPin} stats={data.net_metrics?.por_estado} />
              <RenderStatGroup title="4. Tecnología | Persona" icon={Zap} stats={data.net_metrics?.por_tecnologia_persona} />
            </div>

            {/* Grid 3 columnas: Desgloses Complejos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <RenderStatGroup title="5. Estado | Tecnología" icon={LayoutGrid} stats={data.net_metrics?.por_estado_tecnologia} />
              <RenderStatGroup title="6. Estado | Persona" icon={Building2} stats={data.net_metrics?.por_estado_persona} />
              <RenderStatGroup title="7. Matriz: Estado | Tec | Persona" icon={Database} stats={data.net_metrics?.por_estado_tecnologia_persona} />
            </div>
          </section>

          {/* Fila 3: TV y Velocidades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             {/* TV (3 Desgloses) */}
             <section className="space-y-6">
                <div className="flex items-center gap-3 border-l-4 border-emerald-500 pl-4">
                    <Tv className="w-6 h-6 text-emerald-500" />
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Servicio de TV</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <RenderStatGroup title="1. Por Estado" icon={MapPin} stats={data.tv_metrics?.por_estado} color="emerald-400" />
                    <RenderStatGroup title="2. Por Tipo Persona" icon={Users} stats={data.tv_metrics?.por_persona} color="emerald-400" />
                </div>
                <RenderStatGroup title="3. Estado | Persona" icon={LayoutGrid} stats={data.tv_metrics?.por_estado_persona} color="emerald-400" />
             </section>

             {/* VELOCIDADES */}
             <section className="space-y-6">
                <div className="flex items-center gap-3 border-l-4 border-amber-500 pl-4">
                    <Gauge className="w-6 h-6 text-amber-500" />
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Penetración Velocidades</h2>
                </div>
                <div className="bg-surface-secondary border border-slate-800 rounded-3xl overflow-hidden shadow-2xl h-full flex flex-col">
                    <div className="p-4 border-b border-slate-800 bg-amber-500/5 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mbps</span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase"><Info className="w-3 h-3" /> Basado en planes configurados</div>
                    </div>
                    <table className="w-full text-left text-[10px] text-slate-400 uppercase font-black border-collapse flex-1">
                        <thead className="bg-slate-800/30">
                            <tr>
                                <th className="p-4 border-r border-slate-800">Rango de Bajada</th>
                                <th className="p-4 text-right">Alámbrico</th>
                                <th className="p-4 text-right">Inalámbrico</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {Object.entries(data.speed_metrics || {}).map(([rango, techs]: any) => (
                                <tr key={rango} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-4 text-slate-300 font-bold border-r border-slate-800 group-hover:text-white">{rango}</td>
                                    <td className="p-4 text-right text-white font-black">{f0(techs.Alámbrico)}</td>
                                    <td className="p-4 text-right text-white font-black">{f0(techs.Inalámbrico)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </section>
          </div>

          <div className="p-6 bg-brand/5 border border-brand/20 rounded-2xl flex items-center gap-4">
              <CheckCircle2 className="w-8 h-8 text-brand" />
              <div>
                  <p className="text-white font-bold text-sm">Validación Exitosa</p>
                  <p className="text-slate-500 text-xs mt-0.5">Todos los suscriptores activos del mes han sido clasificados correctamente bajo los parámetros del ente regulador.</p>
              </div>
          </div>

        </div>
      ) : (
        /* ESTADO: NO HAY DATOS EN DB */
        <div className="p-20 text-center bg-surface-secondary rounded-3xl border border-dashed border-slate-800">
            <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-white font-bold text-lg uppercase tracking-widest">Información no disponible</h3>
            <p className="text-slate-500 max-w-sm mx-auto mt-2">No se encontró un cierre de activos para {formatPeriodoLabel(selectedPeriod)}. Asegúrate de haber ejecutado el análisis mensual.</p>
        </div>
      )}
    </AppLayout>
  );
}