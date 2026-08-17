import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { Modal } from '@/components/UI/Modal';
import { router } from '@inertiajs/react';
import { 
  Plus, Settings2, ShieldAlert, CheckCircle2, 
  Wifi, Zap, Network, Edit3, Trash2, EyeOff, ShieldCheck, AlertTriangle, Loader2
} from 'lucide-react';
import axios from 'axios';

interface Props {
  individualConfigs?: any[];
  planesConfigs?: any[];
  discoveredPlans?: string[];
  discoveredSubs?: any[];
  allKnownPlans?: any[];
  currentPeriod?: string;
}

export default function EtaManagement({ 
  individualConfigs = [], 
  planesConfigs = [], 
  discoveredPlans = [],
  discoveredSubs = [],
  allKnownPlans = [],
}: Props) {
  const [search, setSearch] = useState('');
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [activeView, setActiveTab] = useState<'discovered_plans' | 'discovered_subs' | 'individual' | 'global'>(() => {
    if (discoveredPlans.length > 0) return 'discovered_plans';
    if (discoveredSubs.length > 0) return 'discovered_subs';
    return 'individual';
  });
  
  // MODALES
  const [editingSub, setEditingSub] = useState<any>(null);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'sub' | 'plan'; id: string } | null>(null);

  // ABRIR EDICIÓN DE SUSCRIPCIÓN CON VALORES PREVIOS CORRECTOS
  const handleOpenEditSub = (c: any) => {
    const isKnown = allKnownPlans.some((p: any) => p.name === c.producto);
    setIsCustomProduct(!isKnown && !!c.producto);
    setEditingSub({
      orden: c.orden || '',
      cliente: c.cliente || '',
      producto: c.producto || '',
      tecnologia: c.tecnologia || 'FTTH',
      tipo_persona: c.tipo_persona || 'pyme',
      datas_mbps: c.datas_mbps || 0,
      tiene_tv: Boolean(c.tiene_tv),
      reportar: c.reportar !== undefined ? Boolean(c.reportar) : true,
      es_transporte: Boolean(c.es_transporte),
      es_dedicado: Boolean(c.es_dedicado)
    });
  };

  // GUARDAR SUSCRIPCIÓN
  const handleUpdateSub = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await axios.post('/subscriptions/api/eta-report/save-sub-config/', editingSub);
      setEditingSub(null);
      router.reload({ preserveScroll: true });
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error guardando la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  // GUARDAR PLAN
  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await axios.post('/subscriptions/api/eta-report/save-plan-config/', editingPlan);
      setEditingPlan(null);
      router.reload({ preserveScroll: true });
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error actualizando el plan');
    } finally {
      setIsSaving(false);
    }
  };

  // ACCIÓN RÁPIDA: NO DECLARAR CON 1 CLIC
  const handleQuickIgnoreSub = async (sub: any) => {
    try {
      await axios.post('/subscriptions/api/eta-report/save-sub-config/', {
        orden: sub.orden,
        cliente: sub.cliente || '',
        producto: sub.producto || 'Servicio Excluido',
        reportar: false,
        tecnologia: 'FTTH',
        tipo_persona: 'pyme',
        datas_mbps: 0,
        es_transporte: false,
        es_dedicado: false
      });
      router.reload({ preserveScroll: true });
    } catch (err) {
      alert('Error al descartar la suscripción');
    }
  };

  // EJECUTAR ELIMINACIÓN
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    try {
      if (deletingItem.type === 'sub') {
        await axios.post('/subscriptions/api/eta-report/delete-sub-config/', { orden: deletingItem.id });
      } else {
        await axios.post('/subscriptions/api/eta-report/delete-plan-config/', { plan_name: deletingItem.id });
      }
      setDeletingItem(null);
      router.reload({ preserveScroll: true });
    } catch (err) {
      alert('Error al eliminar el registro');
    }
  };

  // SELECCIONAR PLAN PREDEFINIDO
  const handleSelectPredefinedPlan = (planName: string) => {
    if (planName === '__CUSTOM__') {
      setIsCustomProduct(true);
      setEditingSub((prev: any) => ({ ...prev, producto: '' }));
      return;
    }

    setIsCustomProduct(false);
    const found = allKnownPlans.find((p: any) => p.name === planName);
    if (found) {
      setEditingSub((prev: any) => ({
        ...prev,
        producto: found.name,
        tecnologia: found.tecnologia || 'FTTH',
        tipo_persona: found.tipo_persona || 'nat',
        datas_mbps: found.datas_mbps || 0,
        tiene_tv: Boolean(found.tiene_tv),
        es_transporte: Boolean(found.es_transporte),
        es_dedicado: Boolean(found.es_dedicado),
      }));
    } else {
      setEditingSub((prev: any) => ({ ...prev, producto: planName }));
    }
  };

  const filteredSubs = useMemo(() => {
    return (individualConfigs || []).filter((c: any) => {
      const cliente = String(c?.cliente || '').toLowerCase();
      const orden = String(c?.orden || '').toLowerCase();
      const term = search.toLowerCase();
      return cliente.includes(term) || orden.includes(term);
    });
  }, [individualConfigs, search]);

  return (
    <AppLayout title="Gestión Maestro de Planes ETA">
      <SubHeader activeTab="eta" />

      {/* SELECTOR DE PESTAÑAS */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 bg-surface-secondary p-1 rounded-2xl border border-slate-800 shadow-xl">
          <button 
            onClick={() => setActiveTab('discovered_plans')} 
            className={`relative px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
              activeView === 'discovered_plans' ? 'bg-amber-500 text-[#0b1326] shadow-lg' : 'text-slate-500 hover:text-white'
            }`}
          >
            Planes por Clasificar
            {discoveredPlans.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[9px]">
                {discoveredPlans.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('discovered_subs')} 
            className={`relative px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
              activeView === 'discovered_subs' ? 'bg-amber-500 text-[#0b1326] shadow-lg' : 'text-slate-500 hover:text-white'
            }`}
          >
            Corporativos Pendientes
            {discoveredSubs.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[9px]">
                {discoveredSubs.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('individual')} 
            className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
              activeView === 'individual' ? 'bg-brand text-white shadow-lg' : 'text-slate-500 hover:text-white'
            }`}
          >
            Suscripciones Guardadas ({individualConfigs.length})
          </button>

          <button 
            onClick={() => setActiveTab('global')} 
            className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
              activeView === 'global' ? 'bg-brand text-white shadow-lg' : 'text-slate-500 hover:text-white'
            }`}
          >
            Planes Masivos ({planesConfigs.length})
          </button>
        </div>

        <button 
          onClick={() => {
            setIsCustomProduct(false);
            setEditingSub({ 
              orden: '', cliente: '', producto: allKnownPlans[0]?.name || '', 
              tecnologia: 'FTTH', tipo_persona: 'pyme', datas_mbps: 100, 
              reportar: true, tiene_tv: false, es_transporte: false, es_dedicado: false 
            });
          }} 
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg"
        >
          <Plus className="w-4 h-4" /> Nuevo Registro Manual
        </button>
      </div>

      {/* CONTENIDO DE TABLAS */}
      <div className="bg-surface-secondary border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        
        {/* 1. PLANES MASIVOS PENDIENTES */}
        {activeView === 'discovered_plans' && (
          <div>
            {discoveredPlans.length === 0 ? (
              <div className="p-20 text-center flex flex-col items-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Todos los planes masivos están clasificados</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-amber-500/10 text-amber-500 font-black uppercase">
                  <tr><th className="p-5">Plan Detectado</th><th className="p-5 text-right">Acción</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {discoveredPlans.map((plan: string) => (
                    <tr key={plan} className="hover:bg-amber-500/5 transition-all">
                      <td className="p-5 font-black text-white text-sm flex items-center gap-3">
                        <ShieldAlert className="w-4 h-4 text-amber-500" /> {plan}
                      </td>
                      <td className="p-5 text-right">
                        <button 
                          onClick={() => setEditingPlan({ 
                            plan_name: plan, tecnologia: 'FTTH', tipo_persona: 'nat', 
                            datas_mbps: 100, tiene_tv: false, reportar: true 
                          })}
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
        )}

        {/* 2. CORPORATIVOS DETECTADOS PENDIENTES */}
        {activeView === 'discovered_subs' && (
          <div>
            {discoveredSubs.length === 0 ? (
              <div className="p-20 text-center flex flex-col items-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No hay suscripciones corporativas pendientes</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-amber-500/10 text-amber-500 font-black uppercase">
                  <tr>
                    <th className="p-5">Orden ID</th>
                    <th className="p-5">Cliente</th>
                    <th className="p-5">Servicio Detectado</th>
                    <th className="p-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {discoveredSubs.map((sub: any) => (
                    <tr key={sub.orden} className="hover:bg-amber-500/5 transition-all">
                      <td className="p-5 font-mono text-brand font-bold">{sub.orden}</td>
                      <td className="p-5 font-bold text-white">{sub.cliente}</td>
                      <td className="p-5 text-slate-300">{sub.producto}</td>
                      <td className="p-5 text-right space-x-2">
                        <button 
                          onClick={() => handleQuickIgnoreSub(sub)}
                          className="bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 px-4 py-2 rounded-xl font-black uppercase text-[10px] transition-all"
                          title="Excluir del cálculo del regulador"
                        >
                          No Declarar
                        </button>
                        <button 
                          onClick={() => handleOpenEditSub({
                            orden: sub.orden, 
                            cliente: sub.cliente, 
                            producto: sub.producto, 
                            tecnologia: 'FTTH', 
                            tipo_persona: 'pyme', 
                            datas_mbps: 50, 
                            reportar: true, 
                            tiene_tv: false, 
                            es_transporte: false, 
                            es_dedicado: true 
                          })}
                          className="bg-amber-500 text-[#0b1326] px-5 py-2 rounded-xl font-black uppercase text-[10px] hover:bg-amber-400 shadow-md"
                        >
                          Configurar Ahora
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 3. SUSCRIPCIONES INDIVIDUALES GUARDADAS */}
        {activeView === 'individual' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 font-black uppercase">
              <tr>
                <th className="p-5">Información del Cliente</th>
                <th className="p-5">Servicio / Configuración</th>
                <th className="p-5 text-center">Estado Declaración</th>
                <th className="p-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredSubs.map((c: any) => (
                <tr key={c.orden} className="hover:bg-white/5 transition-all">
                  <td className="p-5">
                    <p className="font-black text-white text-sm">{c.cliente || 'Sin Nombre'}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {c.orden}</p>
                  </td>
                  <td className="p-5">
                    <p className="text-slate-300 font-bold">{c.producto}</p>
                    <p className="text-[10px] text-slate-500 uppercase mt-1">
                      {c.datas_mbps} Mbps | {c.tecnologia} | {c.tipo_persona === 'pyme' ? 'Jurídica' : 'Natural'}
                    </p>
                  </td>
                  <td className="p-5 text-center">
                    {c.reportar ? (
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Declarado
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full font-bold text-[10px] inline-flex items-center gap-1">
                        <EyeOff className="w-3 h-3" /> No Declarado (Excluido)
                      </span>
                    )}
                  </td>
                  <td className="p-5 text-right space-x-2">
                    <button 
                      onClick={() => handleOpenEditSub(c)}
                      className="p-2.5 bg-slate-800 hover:bg-brand hover:text-white rounded-xl text-slate-400 transition-colors"
                      title="Editar configuración"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setDeletingItem({ type: 'sub', id: c.orden })}
                      className="p-2.5 bg-slate-800 hover:bg-rose-600 hover:text-white rounded-xl text-slate-400 transition-colors"
                      title="Eliminar del maestro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 4. PLANES MASIVOS GUARDADOS */}
        {activeView === 'global' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 font-black uppercase">
              <tr>
                <th className="p-5">Nombre del Plan</th>
                <th className="p-5">Clasificación Regulador</th>
                <th className="p-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {planesConfigs.map((p: any) => (
                <tr key={p.plan_name} className="hover:bg-white/5 transition-all">
                  <td className="p-5 font-black text-white text-sm">{p.plan_name}</td>
                  <td className="p-5">
                    <div className="flex gap-2">
                      <span className="bg-[#0b1326] px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-black text-slate-400">{p.tecnologia}</span>
                      <span className="bg-[#0b1326] px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-black text-emerald-500">{p.tipo_persona}</span>
                      <span className="bg-[#0b1326] px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-black text-amber-500">{p.datas_mbps} Mbps</span>
                    </div>
                  </td>
                  <td className="p-5 text-right space-x-2">
                    <button 
                      onClick={() => setEditingPlan({ ...p })} 
                      className="p-2.5 bg-slate-800 hover:bg-brand hover:text-white rounded-xl text-slate-400 transition-colors"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setDeletingItem({ type: 'plan', id: p.plan_name })}
                      className="p-2.5 bg-slate-800 hover:bg-rose-600 hover:text-white rounded-xl text-slate-400 transition-colors"
                      title="Eliminar plan personalizado"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL SUSCRIPCIÓN INDIVIDUAL */}
      <Modal isOpen={!!editingSub} onClose={() => setEditingSub(null)} title="Parametrización de Suscripción Especializada" size="lg">
        {editingSub && (
          <form onSubmit={handleUpdateSub} className="space-y-6">
            
            {/* TOGGLE DECLARAR VS EXCLUIR */}
            <div className="p-4 rounded-2xl border border-slate-800 bg-surface-tertiary/30 flex items-center justify-between">
              <div>
                <h6 className="text-xs font-bold text-white">Estado en el Reporte ETA</h6>
                <p className="text-[10px] text-slate-400">Si seleccionas "No Declarar", se resolverá la alerta y el cliente no sumará en las matrices.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSub({ ...editingSub, reportar: !editingSub.reportar })}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                  editingSub.reportar 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {editingSub.reportar ? <ShieldCheck className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {editingSub.reportar ? 'Declarar en Reporte' : 'No Declarar / Excluido'}
              </button>
            </div>

            {/* SELECCIÓN DE TIPO DE SERVICIO ESTILO CARDS */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Tipo de Servicio para el Regulador
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                
                {/* Internet Estándar */}
                <div 
                  onClick={() => setEditingSub({ ...editingSub, es_transporte: false, es_dedicado: false })}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    !editingSub.es_transporte && !editingSub.es_dedicado 
                      ? 'bg-brand/15 border-brand ring-1 ring-brand shadow-lg shadow-brand/10' 
                      : 'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Wifi className={`w-5 h-5 ${!editingSub.es_transporte && !editingSub.es_dedicado ? 'text-brand' : 'text-slate-400'}`} />
                    {!editingSub.es_transporte && !editingSub.es_dedicado && <CheckCircle2 className="w-4 h-4 text-brand" />}
                  </div>
                  <div>
                    <h6 className="text-xs font-bold text-white">Internet Estándar</h6>
                    <p className="text-[9px] text-slate-400 mt-1 leading-tight">Acceso público regular. Suma a las matrices y velocidades.</p>
                  </div>
                </div>

                {/* Internet Dedicado */}
                <div 
                  onClick={() => setEditingSub({ ...editingSub, es_transporte: false, es_dedicado: true })}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    editingSub.es_dedicado && !editingSub.es_transporte 
                      ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500 shadow-lg shadow-emerald-500/10' 
                      : 'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Zap className={`w-5 h-5 ${editingSub.es_dedicado && !editingSub.es_transporte ? 'text-emerald-400' : 'text-slate-400'}`} />
                    {editingSub.es_dedicado && !editingSub.es_transporte && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div>
                    <h6 className="text-xs font-bold text-white">Internet Dedicado</h6>
                    <p className="text-[9px] text-slate-400 mt-1 leading-tight">Enlace corporativo. Suma a matrices de Internet.</p>
                  </div>
                </div>

                {/* Transporte de Datos */}
                <div 
                  onClick={() => setEditingSub({ ...editingSub, es_transporte: true, es_dedicado: false })}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                    editingSub.es_transporte 
                      ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500 shadow-lg shadow-amber-500/10' 
                      : 'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Network className={`w-5 h-5 ${editingSub.es_transporte ? 'text-amber-400' : 'text-slate-400'}`} />
                    {editingSub.es_transporte && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div>
                    <h6 className="text-xs font-bold text-white">Transporte de Datos</h6>
                    <p className="text-[9px] text-slate-400 mt-1 leading-tight">Circuito L2. Se separa del universo de Internet.</p>
                  </div>
                </div>

              </div>
            </div>

            {/* CAMPOS DE DETALLE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">ID de Orden / Suscripción</label>
                  <input 
                    type="text" 
                    required
                    value={editingSub.orden} 
                    onChange={(e) => setEditingSub({...editingSub, orden: e.target.value})} 
                    className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:border-brand outline-none" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre del Cliente</label>
                  <input 
                    type="text" 
                    value={editingSub.cliente} 
                    onChange={(e) => setEditingSub({...editingSub, cliente: e.target.value})} 
                    className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:border-brand outline-none" 
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Plan / Producto</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomProduct(!isCustomProduct)}
                      className="text-[10px] text-brand hover:underline font-semibold flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      {isCustomProduct ? 'Elegir de Planes.json' : 'Escribir manual'}
                    </button>
                  </div>

                  {isCustomProduct ? (
                    <input 
                      type="text" 
                      placeholder="Nombre del servicio o producto..."
                      value={editingSub.producto} 
                      onChange={(e) => setEditingSub({...editingSub, producto: e.target.value})} 
                      className="w-full bg-surface-tertiary border border-brand/50 rounded-xl p-2.5 text-xs text-white focus:border-brand outline-none" 
                    />
                  ) : (
                    <select
                      value={editingSub.producto}
                      onChange={(e) => handleSelectPredefinedPlan(e.target.value)}
                      className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:border-brand outline-none"
                    >
                      <option value="">-- Selecciona un plan de Planes.json --</option>
                      {allKnownPlans.map((p: any) => (
                        <option key={p.name} value={p.name}>
                          {p.name} ({p.datas_mbps} Mbps - {p.tecnologia})
                        </option>
                      ))}
                      <option value="__CUSTOM__">➕ Otro / Escribir producto personalizado...</option>
                    </select>
                  )}
                </div>
              </div>

              {/* CLASIFICACIÓN TÉCNICA */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      value={editingSub.tecnologia} 
                      onChange={(e) => setEditingSub({...editingSub, tecnologia: e.target.value})} 
                      className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                    >
                      <option value="FTTH">Fibra (Alámbrico)</option>
                      <option value="RF">Radio (Inalámbrico)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo Persona</label>
                    <select 
                      value={editingSub.tipo_persona} 
                      onChange={(e) => setEditingSub({...editingSub, tipo_persona: e.target.value})} 
                      className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                    >
                      <option value="pyme">Jurídica / Pyme</option>
                      <option value="nat">Natural</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Velocidad Asignada (Mbps)</label>
                  <input 
                    type="number" 
                    value={editingSub.datas_mbps || 0} 
                    onChange={(e) => setEditingSub({...editingSub, datas_mbps: parseFloat(e.target.value) || 0})} 
                    className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white" 
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input 
                    type="checkbox" 
                    id="chk_sub_tv"
                    checked={Boolean(editingSub.tiene_tv)} 
                    onChange={(e) => setEditingSub({...editingSub, tiene_tv: e.target.checked})} 
                    className="w-4 h-4 rounded text-brand"
                  />
                  <label htmlFor="chk_sub_tv" className="text-xs font-bold text-slate-300">Incluye Servicio de TV</label>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button 
                type="button" 
                disabled={isSaving}
                onClick={() => setEditingSub(null)}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={isSaving}
                className="bg-brand hover:bg-brand-hover text-white px-8 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-brand/20 flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar Cambios
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL PLAN GLOBAL */}
      <Modal isOpen={!!editingPlan} onClose={() => setEditingPlan(null)} title="Configuración de Plan Masivo" size="md">
        {editingPlan && (
          <form onSubmit={handleUpdatePlan} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre del Plan</label>
              <input type="text" disabled value={editingPlan.plan_name} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-xs text-slate-400" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                <select 
                  value={editingPlan.tecnologia} 
                  onChange={(e) => setEditingPlan({...editingPlan, tecnologia: e.target.value})} 
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  <option value="FTTH">Fibra Óptica (Alámbrico)</option>
                  <option value="RF">Radiofrecuencia (Inalámbrico)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo Persona</label>
                <select 
                  value={editingPlan.tipo_persona} 
                  onChange={(e) => setEditingPlan({...editingPlan, tipo_persona: e.target.value})} 
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  <option value="nat">Natural</option>
                  <option value="pyme">Jurídica / Pyme</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Velocidad (Mbps)</label>
                <input 
                  type="number" 
                  value={editingPlan.datas_mbps || 0} 
                  onChange={(e) => setEditingPlan({...editingPlan, datas_mbps: parseFloat(e.target.value) || 0})} 
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white" 
                />
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input 
                  type="checkbox" 
                  id="chk_tv"
                  checked={Boolean(editingPlan.tiene_tv)} 
                  onChange={(e) => setEditingPlan({...editingPlan, tiene_tv: e.target.checked})} 
                  className="w-4 h-4 rounded text-brand"
                />
                <label htmlFor="chk_tv" className="text-xs font-bold text-slate-300">Incluye Servicio de TV</label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button 
                type="submit" 
                disabled={isSaving}
                className="bg-brand text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar y Aplicar al Maestro
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      <Modal isOpen={!!deletingItem} onClose={() => setDeletingItem(null)} title="Confirmar Eliminación" size="sm">
        {deletingItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>¿Estás seguro de que deseas eliminar <strong>{deletingItem.id}</strong> del maestro?</span>
            </div>
            <p className="text-xs text-slate-400">Esta acción no se puede deshacer y la orden o plan volverá al estado no clasificado.</p>
            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/20"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        )}
      </Modal>

    </AppLayout>
  );
}