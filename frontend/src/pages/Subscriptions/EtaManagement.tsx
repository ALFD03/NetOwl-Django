import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { Modal } from '@/components/UI/Modal';
import { 
  Briefcase, DatabaseZap, Search, RefreshCw, Plus, 
  Settings2, Save, Wifi, Users, Gauge, Tv, Globe, ShieldCheck, ShieldAlert, CheckCircle2, XCircle
} from 'lucide-react';
import axios from 'axios';

export default function EtaManagement({ individualConfigs = [], planesConfigs = [], discoveredPlans = [] }: any) {
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeView, setActiveTab] = useState<'individual' | 'global' | 'discovered'>('discovered'); // Default a descubiertos para que se vea la alerta
  
  // MODALES
  const [editingSub, setEditingSub] = useState<any>(null);
  const [editingPlan, setEditingPlan] = useState<any>(null);

  const handleUpdateSub = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/subscriptions/api/eta-report/save-sub-config/', editingSub);
      window.location.reload();
    } finally { setSaving(false); }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/subscriptions/api/eta-report/save-plan-config/', editingPlan);
      window.location.reload();
    } finally { setSaving(false); }
  };

  const filteredSubs = useMemo(() => {
    return individualConfigs.filter((c: any) => c.cliente.toLowerCase().includes(search.toLowerCase()) || c.orden.toLowerCase().includes(search.toLowerCase()));
  }, [individualConfigs, search]);

  return (
    <AppLayout title="Gestión Maestro de Planes ETA">
        <SubHeader activeTab="eta" />

      {/* SELECTOR DE VISTA */}
    <div className="mb-10 flex items-center justify-between gap-4">
        <div className="flex gap-1 bg-surface-secondary p-1 rounded-2xl border border-slate-800 shadow-xl">
            <button onClick={() => setActiveTab('discovered')} className={`relative px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'discovered' ? 'bg-amber-500 text-[#0b1326] shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                Planes por Clasificar
                {discoveredPlans.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8px] animate-bounce">{discoveredPlans.length}</span>}
            </button>
            <button onClick={() => setActiveTab('individual')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'individual' ? 'bg-brand text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Suscripciones Corporativas</button>
            <button onClick={() => setActiveTab('global')} className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'global' ? 'bg-brand text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Maestro Global</button>
        </div>

        <div className="relative flex-1 max-w-sm group">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-brand transition-colors" />
            <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-[#0f1a36] border border-slate-800 rounded-2xl pl-11 pr-4 py-2.5 text-xs text-white w-full outline-none focus:border-brand shadow-inner" />
        </div>
        
        <button onClick={() => setEditingSub({ orden: '', cliente: '', producto: '', tecnologia: 'FTTH', tipo_persona: 'pyme', datas_mbps: 0, reportar: true, tiene_tv: false })} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20">
            <Plus className="w-4 h-4" /> Nuevo Registro
        </button>
    </div>

      {/* TABLA DE GESTIÓN */}
      <div className="bg-surface-secondary border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        {activeView === 'discovered' ? (
          /* VISTA DE PLANES DETECTADOS EN SUBSCRIPCIONES PERO NO EN CONFIG */
        <div className="p-0">
            {discoveredPlans.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Todos los planes están correctamente clasificados</p>
                </div>
             ) : (
                <table className="w-full text-left text-xs">
                    <thead className="bg-amber-500/10 text-amber-500 font-black uppercase sticky top-0">
                        <tr><th className="p-5">Plan Detectado en Sistema</th><th className="p-5 text-right">Acción Requerida</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {discoveredPlans.map((plan: string) => (
                            <tr key={plan} className="hover:bg-amber-500/5 transition-all">
                                <td className="p-5 font-black text-white text-sm flex items-center gap-3">
                                    <ShieldAlert className="w-4 h-4 text-amber-500" /> {plan}
                                </td>
                                <td className="p-5 text-right">
                                    <button 
                                        onClick={() => setEditingPlan({ plan_name: plan, tecnologia: 'FTTH', tipo_persona: 'nat' })}
                                        className="bg-amber-500 text-[#0b1326] px-6 py-2 rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-amber-400"
                                    >
                                        Clasificar Plan
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
        ) : (
        <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 font-black uppercase sticky top-0">
                {activeView === 'individual' ? (
                    <tr><th className="p-5">Información del Cliente</th><th className="p-5">Servicio / Producto</th><th className="p-5 text-right">Configuración</th></tr>
                ) : (
                    <tr><th className="p-5">Nombre del Plan</th><th className="p-5">Clasificación</th><th className="p-5 text-right">Editar</th></tr>
                )}
            </thead>
            <tbody className="divide-y divide-slate-800">
                {activeView === 'individual' ? filteredSubs.map((c: any) => (
                    <tr key={c.orden} className="hover:bg-white/5 transition-all group">
                        <td className="p-5"><p className="font-black text-white text-sm group-hover:text-brand transition-colors">{c.cliente}</p><p className="text-[10px] text-slate-500 font-black uppercase mt-1">ID: {c.orden}</p></td>
                        <td className="p-5"><p className="text-slate-300 font-bold">{c.producto}</p><p className="text-[10px] text-slate-500 uppercase mt-1">{c.datas_mbps} Mbps | {c.tecnologia === 'FTTH' ? 'Fibra' : 'Radio'}</p></td>
                        <td className="p-5 text-right"><button onClick={() => setEditingSub(c)} className="p-3 bg-slate-800 hover:bg-brand hover:text-white rounded-2xl border border-slate-700 transition-all text-slate-400 shadow-xl"><Settings2 className="w-4 h-4" /></button></td>
                    </tr>
                )) : planesConfigs.map((p: any) => (
                    <tr key={p.plan_name} className="hover:bg-white/5 transition-all">
                        <td className="p-5 font-black text-white text-sm">{p.plan_name}</td>
                        <td className="p-5">
                            <div className="flex gap-2">
                                <div className="bg-[#0b1326] px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-black text-slate-400 uppercase">{p.tecnologia}</div>
                                <div className="bg-[#0b1326] px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-black text-emerald-500 uppercase">{p.tipo_persona}</div>
                            </div>
                        </td>
                        <td className="p-5 text-right"><button onClick={() => setEditingPlan(p)} className="p-3 bg-slate-800 hover:bg-brand hover:text-white rounded-2xl border border-slate-700 transition-all text-slate-400 shadow-xl"><Settings2 className="w-4 h-4" /></button></td>
                    </tr>
                ))}
            </tbody>
        </table>
        )}
    </div>
      

      {/* MODAL SUSCRIPCIÓN INDIVIDUAL */}
      <Modal isOpen={!!editingSub} onClose={() => setEditingSub(null)} title="Configuración de Suscripción Especializada" size="lg">
        {editingSub && (
            <form onSubmit={handleUpdateSub} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h5 className="text-[10px] font-black text-slate-500 uppercase border-b border-slate-800 pb-2">Información Básica</h5>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400">ID de Orden</label><input type="text" value={editingSub.orden} onChange={(e) => setEditingSub({...editingSub, orden: e.target.value})} className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-brand" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400">Cliente</label><input type="text" value={editingSub.cliente} onChange={(e) => setEditingSub({...editingSub, cliente: e.target.value})} className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-brand" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400">Producto</label><input type="text" value={editingSub.producto} onChange={(e) => setEditingSub({...editingSub, producto: e.target.value})} className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-brand" /></div>
                    </div>
                    <div className="space-y-4">
                        <h5 className="text-[10px] font-black text-slate-500 uppercase border-b border-slate-800 pb-2">Configuración Técnica</h5>
                        <div className="grid grid-cols-1 gap-2">
                             <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label><select value={editingSub.tecnologia} onChange={(e) => setEditingSub({...editingSub, tecnologia: e.target.value})} className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-3 text-xs text-white"><option value="FTTH">Fibra (Alámbrico)</option><option value="RF">Radio (Inalámbrico)</option></select></div>
                             <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Velocidad (Mbps)</label><input type="number" value={editingSub.datas_mbps} onChange={(e) => setEditingSub({...editingSub, datas_mbps: e.target.value})} className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-3 text-xs text-white" /></div>
                             <button type="button" onClick={() => setEditingSub({...editingSub, reportar: !editingSub.reportar})} className={`flex items-center justify-between p-3 rounded-xl border mt-2 transition-all ${editingSub.reportar ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><span className="text-xs font-bold uppercase">Incluir en Reporte</span>{editingSub.reportar ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}</button>
                        </div>
                    </div>
                </div>
                <div className="pt-6 border-t border-slate-800 flex justify-end gap-3"><button type="submit" className="bg-brand text-white px-10 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Guardar Cambios</button></div>
            </form>
        )}
      </Modal>

      {/* MODAL PLAN GLOBAL */}
      <Modal isOpen={!!editingPlan} onClose={() => setEditingPlan(null)} title="Configuración de Plan Masivo" size="sm">
        {editingPlan && (
            <form onSubmit={handleUpdatePlan} className="space-y-6">
                <div className="space-y-4">
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tecnología Regulador</label><select value={editingPlan.tecnologia} onChange={(e) => setEditingPlan({...editingPlan, tecnologia: e.target.value})} className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-brand"><option value="FTTH">Fibra Óptica</option><option value="RF">Radiofrecuencia</option></select></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo de Persona</label><select value={editingPlan.tipo_persona} onChange={(e) => setEditingPlan({...editingPlan, tipo_persona: e.target.value})} className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:border-brand"><option value="nat">Natural</option><option value="pyme">Jurídica</option></select></div>
                </div>
                <div className="pt-6 border-t border-slate-800 flex justify-end"><button type="submit" className="bg-brand text-white w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl">Actualizar Plan</button></div>
            </form>
        )}
      </Modal>

    </AppLayout>
  );
}