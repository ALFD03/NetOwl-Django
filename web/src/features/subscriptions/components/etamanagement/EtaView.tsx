/** Pantalla de parametrización ETA: pendientes y excepciones por suscripción. */

import {
  CheckCircle2, Edit3, EyeOff, Network, Plus, Settings2, ShieldAlert, Trash2,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DataTable, EmptyState, Modal, NeonContainer, type Column } from '@/shared/ui';
import { formatTwoDecimals } from '@/shared/utils/formatters';
import { useEtaManagement } from '@/features/subscriptions/hooks/useEtaManagement';
import type {
  EtaDiscoveredSubscription,
  EtaSubscriptionConfig,
  SubscriptionEtaManagementProps,
} from '@/features/subscriptions/types';
import { SubscriptionForm } from './Forms';

type Props = SubscriptionEtaManagementProps;

/**
 * Cómo se declara una excepción: en la hoja de internet, en la de transporte,
 * o como un enlace dedicado que va en la de internet con nombre propio.
 *
 * Es lo primero por lo que se filtra cuando se revisa el maestro, y no es un
 * campo sino la combinación de dos banderas, así que se resuelve una vez aquí.
 */
const tipoDeclaracion = (sub: EtaSubscriptionConfig): string => {
  if (sub.es_transporte) return 'Transporte';
  if (sub.es_dedicado) return 'Dedicado';
  return 'Internet';
};

const textoOGuion = (valor?: string) => valor?.trim() || '—';

/**
 * Parametrización del reporte ETA.
 *
 * La pestaña de "planes masivos" ya no está: un plan se clasifica en el
 * catálogo (`/subscriptions/config/`) y no había motivo para que ETA guardara
 * una segunda clasificación que pisaba a aquella. Lo que queda aquí son las
 * excepciones por orden, que sí son de cada contrato.
 *
 * Las dos tablas son `DataTable` y no marcado propio: traen búsqueda, orden y
 * filtros por columna, que es justo lo que hace falta para encontrar un
 * contrato entre miles, y antes estaban escritas a mano sin nada de eso.
 */
export function EtaManagementView({
  individualConfigs = [],
  discoveredPlans = [],
  discoveredSubs = [],
  allKnownPlans = [],
}: Props) {
  const {
    isCustomProduct, setIsCustomProduct, isSaving, activeView, setActiveTab,
    editingSub, setEditingSub, deletingItem, setDeletingItem,
    handleOpenEditSub, handleUpdateSub, handleQuickIgnoreSub, handleConfirmDelete,
    handleSelectPredefinedPlan,
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
      precio: 0,
      reportar: true,
      tiene_tv: false,
      es_transporte: false,
      es_dedicado: false,
    });
  };

  const botonIcono = (
    onClick: () => void,
    titulo: string,
    icono: React.ReactNode,
    tono: string,
  ) => (
    <button type="button" onClick={onClick} title={titulo} className={`rounded-lg border p-2 ${tono}`}>
      {icono}
    </button>
  );

  const columnasPendientes: Column<EtaDiscoveredSubscription>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', className: 'font-bold text-white' },
    { header: 'Cliente', accessor: (row) => textoOGuion(row.cliente), sortKey: 'cliente' },
    { header: 'Producto', accessor: (row) => textoOGuion(row.producto), sortKey: 'producto', filterable: true },
    {
      header: 'Sucursal',
      accessor: (row) => textoOGuion(row.sucursal),
      sortKey: 'sucursal',
      filterable: true,
      filterValue: (row) => row.sucursal?.trim() || 'Sin sucursal',
    },
    {
      header: 'Zona',
      accessor: (row) => textoOGuion(row.zona),
      sortKey: 'zona',
      filterable: true,
      filterValue: (row) => row.zona?.trim() || 'Sin zona',
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          {botonIcono(() => handleOpenEditSub(row), 'Clasificar', <Edit3 className="h-4 w-4" />, 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10')}
          {botonIcono(() => handleQuickIgnoreSub(row), 'Ignorar', <EyeOff className="h-4 w-4" />, 'border-slate-700 text-slate-400 hover:bg-slate-700/30')}
        </div>
      ),
    },
  ];

  const columnasGuardadas: Column<EtaSubscriptionConfig>[] = [
    { header: 'Orden', accessor: 'orden', sortKey: 'orden', className: 'font-bold text-white' },
    { header: 'Cliente', accessor: (row) => textoOGuion(row.cliente), sortKey: 'cliente' },
    { header: 'Producto', accessor: (row) => textoOGuion(row.producto), sortKey: 'producto', filterable: true },
    {
      header: 'Declaración',
      accessor: tipoDeclaracion,
      filterable: true,
      filterValue: tipoDeclaracion,
    },
    { header: 'Tecnología', accessor: (row) => textoOGuion(row.tecnologia), sortKey: 'tecnologia', filterable: true },
    { header: 'Persona', accessor: (row) => textoOGuion(row.tipo_persona), sortKey: 'tipo_persona', filterable: true },
    { header: 'Mbps', accessor: 'datas_mbps', align: 'right', sortKey: 'datas_mbps' },
    {
      // La renta con la que se declara este enlace. El catálogo comercial no
      // puede darla —cada dedicado negocia la suya—, así que es el único sitio
      // donde se ve si falta.
      header: 'Renta',
      accessor: (row) => (row.precio ? formatTwoDecimals(row.precio) : '— sin fijar'),
      align: 'right',
      sortKey: 'precio',
      filterable: true,
      filterValue: (row) => (row.precio ? 'Con renta' : 'Sin renta'),
    },
    {
      header: 'TV',
      accessor: (row) => (row.tiene_tv ? 'Sí' : '—'),
      filterable: true,
      filterValue: (row) => (row.tiene_tv ? 'Sí' : 'No'),
    },
    {
      header: 'Reportar',
      accessor: (row) => (row.reportar === false
        ? <EyeOff className="h-4 w-4 text-slate-500" />
        : <CheckCircle2 className="h-4 w-4 text-emerald-400" />),
      filterable: true,
      filterValue: (row) => (row.reportar === false ? 'No se reporta' : 'Se reporta'),
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          {botonIcono(() => handleOpenEditSub(row), 'Editar', <Edit3 className="h-4 w-4" />, 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10')}
          {botonIcono(() => setDeletingItem({ type: 'sub', id: row.orden }), 'Eliminar', <Trash2 className="h-4 w-4" />, 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10')}
        </div>
      ),
    },
  ];

  return (
    <AppLayout
      subpagina="Maestro de planes"
      toolbar={
        <>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-1 bg-surface-secondary p-1.5 rounded-2xl border border-slate-800 shadow-xl">
              {[
                ['discovered_plans', 'Planes por Clasificar', discoveredPlans.length],
                ['discovered_subs', 'Corporativos Pendientes', discoveredSubs.length],
                ['individual', 'Suscripciones Guardadas', individualConfigs.length],
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
              onClick={createSub}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" /> Nuevo Registro
            </button>
          </div>
        </>
      }
    >
      {activeView === 'discovered_plans' && (
        <NeonContainer title="Planes detectados" subtitle="Productos encontrados en los datos que todavía no están en el catálogo" icon={<ShieldAlert className="w-5 h-5" />} theme="yellow">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {discoveredPlans.map((plan) => (
              <div key={plan} className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4 flex items-center justify-between gap-3">
                <div><div className="font-bold text-white">{plan}</div><div className="text-[10px] uppercase text-slate-500">Sin registrar en el catálogo</div></div>
                {/* Enlace y no formulario: el plan se da de alta en el catálogo,
                    que es de donde ETA lee su clasificación. */}
                <a href={`/subscriptions/config/?nuevo_plan=${encodeURIComponent(plan)}`} className="rounded-xl border border-amber-500/30 p-2 text-amber-400 hover:bg-amber-500/10" title="Crear en el catálogo"><Settings2 className="w-4 h-4" /></a>
              </div>
            ))}
            {discoveredPlans.length === 0 && <div className="col-span-full py-10 text-center text-slate-500">No hay planes pendientes.</div>}
          </div>
        </NeonContainer>
      )}

      {activeView === 'discovered_subs' && (
        <NeonContainer
          title="Suscripciones detectadas"
          subtitle="Registros que requieren clasificación manual"
          icon={<ShieldAlert className="w-5 h-5" />}
          theme="yellow"
          noPadding
        >
          {discoveredSubs.length === 0 ? (
            <EmptyState
              title="No hay suscripciones pendientes"
              description="Todos los contratos dedicados y de transporte están clasificados."
              icon={<CheckCircle2 />}
            />
          ) : (
            <DataTable
              columns={columnasPendientes}
              data={discoveredSubs}
              searchable
              searchPlaceholder="Buscar por orden, cliente o producto..."
            />
          )}
        </NeonContainer>
      )}

      {activeView === 'individual' && (
        <NeonContainer
          title="Suscripciones guardadas"
          subtitle="Configuración individual de órdenes ETA"
          icon={<Network className="w-5 h-5" />}
          theme="blue"
          noPadding
        >
          {individualConfigs.length === 0 ? (
            <EmptyState
              title="Todavía no hay excepciones guardadas"
              description="Las excepciones por orden se crean desde la pestaña de corporativos pendientes."
              icon={<Network />}
            />
          ) : (
            <DataTable
              columns={columnasGuardadas}
              data={individualConfigs}
              searchable
              searchPlaceholder="Buscar por orden, cliente o producto..."
            />
          )}
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
