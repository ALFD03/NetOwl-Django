import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import { Modal } from '@/shared/ui';
import { NeonContainer } from '@/shared/ui';
import {
  Plus, Settings2, ShieldAlert, CheckCircle2, Wifi, Network,
  Edit3, Trash2, EyeOff, Layers, Search
} from 'lucide-react';
import { useEtaManagement } from '@/features/subscriptions/hooks/useEtaManagement';
import type {
  SubscriptionEtaManagementProps,
} from '@/features/subscriptions/types';
import { PlanForm, SubscriptionForm } from './Forms';

type Props = SubscriptionEtaManagementProps;

export const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500/60';
export const labelClass = 'mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500';
export function EtaManagementView({
  individualConfigs = [],
  planesConfigs = [],
  discoveredPlans = [],
  discoveredSubs = [],
  allKnownPlans = [],
}: Props) {
  const {
    search, setSearch, isCustomProduct, setIsCustomProduct, isSaving, activeView, setActiveTab,
    editingSub, setEditingSub, editingPlan, setEditingPlan, deletingItem, setDeletingItem, filteredSubs,
    handleOpenEditSub, handleUpdateSub, handleUpdatePlan, handleQuickIgnoreSub, handleConfirmDelete, handleSelectPredefinedPlan,
  } = useEtaManagement({ individualConfigs, allKnownPlans, discoveredPlans, discoveredSubs });

  const createSub = () => {
    setIsCustomProduct(false);
    setEditingSub({
      orden: '',
      cliente: '',
      producto: allKnownPlans[0]?.name ?? allKnownPlans[0]?.plan_name ?? '',
      tecnologia: 'FTTH',
      tipo_persona: 'pyme',
      datas_mbps: 100,
      reportar: true,
      tiene_tv: false,
      es_transporte: false,
      es_dedicado: false,
    });
  };

  const createPlan = () => {
    setEditingPlan({
      plan_name: '',
      name: '',
      tecnologia: 'FTTH',
      tipo_persona: 'pyme',
      datas_mbps: 100,
      tiene_tv: false,
      es_transporte: false,
      es_dedicado: false,
    });
  };

  return (
    <AppLayout
      title="Gestión Maestro de Planes ETA"
      toolbar={
        <>
          <ModuleHeader module="subscriptions" activeTab="eta" />
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-1 bg-surface-secondary p-1.5 rounded-2xl border border-slate-800 shadow-xl">
              {[
                ['discovered_plans', 'Planes por Clasificar', discoveredPlans.length],
                ['discovered_subs', 'Corporativos Pendientes', discoveredSubs.length],
                ['individual', 'Suscripciones Guardadas', individualConfigs.length],
                ['global', 'Planes Masivos', planesConfigs.length],
              ].map(([view, label, count]) => (
                <button
                  key={String(view)}
                  onClick={() => setActiveTab(view as typeof activeView)}
                  className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === view ? 'bg-brand text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                >
                  {label} <span className="ml-1 text-[9px] opacity-70">{String(count)}</span>
                </button>
              ))}
            </div>

            <button
              onClick={activeView === 'global' ? createPlan : createSub}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" /> {activeView === 'global' ? 'Nuevo Plan' : 'Nuevo Registro'}
            </button>
          </div>
        </>
      }
    >
      {activeView === 'discovered_plans' && (
        <NeonContainer title="Planes detectados" subtitle="Productos encontrados en los datos que todavía no tienen clasificación" icon={<ShieldAlert className="w-5 h-5" />} theme="yellow">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {discoveredPlans.map((plan) => (
              <div key={plan} className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4 flex items-center justify-between gap-3">
                <div><div className="font-bold text-white">{plan}</div><div className="text-[10px] uppercase text-slate-500">Pendiente de clasificación</div></div>
                <button onClick={() => { setEditingPlan({ plan_name: plan, name: plan, tecnologia: 'FTTH', tipo_persona: 'pyme', datas_mbps: 0 }); }} className="rounded-xl border border-amber-500/30 p-2 text-amber-400 hover:bg-amber-500/10" title="Clasificar"><Settings2 className="w-4 h-4" /></button>
              </div>
            ))}
            {discoveredPlans.length === 0 && <div className="col-span-full py-10 text-center text-slate-500">No hay planes pendientes.</div>}
          </div>
        </NeonContainer>
      )}

      {activeView === 'discovered_subs' && (
        <NeonContainer title="Suscripciones detectadas" subtitle="Registros que requieren clasificación manual" icon={<ShieldAlert className="w-5 h-5" />} theme="yellow">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500"><th className="p-3">Orden</th><th>Cliente</th><th>Producto</th><th className="text-right p-3">Acciones</th></tr></thead>
              <tbody>
                {discoveredSubs.map((sub) => (
                  <tr key={sub.orden} className="border-b border-slate-900 hover:bg-slate-800/30">
                    <td className="p-3 font-bold text-white">{sub.orden}</td><td className="p-3 text-slate-300">{sub.cliente || '—'}</td><td className="p-3 text-slate-300">{sub.producto || '—'}</td>
                    <td className="p-3 text-right space-x-2">
                      <button onClick={() => handleOpenEditSub(sub)} className="rounded-lg border border-sky-500/30 p-2 text-sky-400" title="Editar"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleQuickIgnoreSub(sub)} className="rounded-lg border border-slate-700 p-2 text-slate-400" title="Ignorar"><EyeOff className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {discoveredSubs.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-slate-500">No hay suscripciones pendientes.</td></tr>}
              </tbody>
            </table>
          </div>
        </NeonContainer>
      )}

      {activeView === 'individual' && (
        <NeonContainer title="Suscripciones guardadas" subtitle="Configuración individual de órdenes ETA" icon={<Network className="w-5 h-5" />} theme="blue">
          <div className="mb-4 relative max-w-md">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
            <input className={`${inputClass} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por orden o cliente..." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500"><th className="p-3">Orden</th><th>Cliente</th><th>Producto</th><th>Tecnología</th><th>Reportar</th><th className="text-right p-3">Acciones</th></tr></thead>
              <tbody>
                {filteredSubs.map((sub) => (
                  <tr key={sub.orden} className="border-b border-slate-900 hover:bg-slate-800/30">
                    <td className="p-3 font-bold text-white">{sub.orden}</td><td className="p-3 text-slate-300">{sub.cliente || '—'}</td><td className="p-3 text-slate-300">{sub.producto || '—'}</td><td className="p-3 text-slate-400">{sub.tecnologia || '—'}</td>
                    <td className="p-3">{sub.reportar === false ? <EyeOff className="w-4 h-4 text-slate-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}</td>
                    <td className="p-3 text-right space-x-2"><button onClick={() => handleOpenEditSub(sub)} className="rounded-lg border border-sky-500/30 p-2 text-sky-400"><Edit3 className="w-4 h-4" /></button><button onClick={() => setDeletingItem({ type: 'sub', id: sub.orden })} className="rounded-lg border border-rose-500/30 p-2 text-rose-400"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
                {filteredSubs.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">No hay registros que coincidan.</td></tr>}
              </tbody>
            </table>
          </div>
        </NeonContainer>
      )}

      {activeView === 'global' && (
        <NeonContainer title="Planes masivos" subtitle="Configuración reutilizable por producto" icon={<Layers className="w-5 h-5" />} theme="purple">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500"><th className="p-3">Plan</th><th>Tecnología</th><th>Persona</th><th>Mbps</th><th>TV</th><th className="text-right p-3">Acciones</th></tr></thead>
              <tbody>
                {planesConfigs.map((plan) => (
                  <tr key={plan.plan_name} className="border-b border-slate-900 hover:bg-slate-800/30">
                    <td className="p-3 font-bold text-white">{plan.name || plan.plan_name}</td><td className="p-3 text-slate-300">{plan.tecnologia || '—'}</td><td className="p-3 text-slate-300">{plan.tipo_persona || '—'}</td><td className="p-3 text-slate-300">{plan.datas_mbps ?? 0}</td><td className="p-3">{plan.tiene_tv ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Wifi className="w-4 h-4 text-slate-600" />}</td>
                    <td className="p-3 text-right space-x-2"><button onClick={() => setEditingPlan({ ...plan })} className="rounded-lg border border-sky-500/30 p-2 text-sky-400"><Edit3 className="w-4 h-4" /></button><button onClick={() => setDeletingItem({ type: 'plan', id: plan.plan_name })} className="rounded-lg border border-rose-500/30 p-2 text-rose-400"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
                {planesConfigs.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-500">No hay planes configurados.</td></tr>}
              </tbody>
            </table>
          </div>
        </NeonContainer>
      )}

      <Modal isOpen={Boolean(editingSub)} onClose={() => setEditingSub(null)} title="Configurar suscripción ETA" subtitle="Datos de clasificación y reporte" icon={<Settings2 className="w-5 h-5 text-amber-400" />} theme="yellow">
        {editingSub && (
          <SubscriptionForm
            value={editingSub}
            plans={allKnownPlans}
            custom={isCustomProduct}
            saving={isSaving}
            onCustomChange={setIsCustomProduct}
            onPlanChange={handleSelectPredefinedPlan}
            onChange={(patch) => setEditingSub({ ...editingSub, ...patch })}
            onSubmit={handleUpdateSub}
            onClose={() => setEditingSub(null)}
          />
        )}
      </Modal>

      <Modal isOpen={Boolean(editingPlan)} onClose={() => setEditingPlan(null)} title="Configurar plan ETA" subtitle="Clasificación reutilizable" icon={<Settings2 className="w-5 h-5 text-purple-400" />} theme="purple">
        {editingPlan && (
          <PlanForm
            value={editingPlan}
            saving={isSaving}
            onChange={(patch) => setEditingPlan({ ...editingPlan, ...patch })}
            onSubmit={handleUpdatePlan}
            onClose={() => setEditingPlan(null)}
          />
        )}
      </Modal>

      <Modal isOpen={Boolean(deletingItem)} onClose={() => setDeletingItem(null)} title="Confirmar eliminación" subtitle="Esta acción no se puede deshacer" icon={<Trash2 className="w-5 h-5 text-rose-400" />} theme="red" size="sm">
        <div className="space-y-5">
          <p className="text-sm text-slate-300">¿Deseas eliminar el registro <strong className="text-white">{deletingItem?.id}</strong>?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeletingItem(null)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-black uppercase text-slate-400">Cancelar</button>
            <button onClick={handleConfirmDelete} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black uppercase text-white hover:bg-rose-500">Eliminar</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
