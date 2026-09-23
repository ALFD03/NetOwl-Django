/** La pantalla de catálogos: siete pestañas más la de productos sin catalogar. */

import type { FormEvent } from 'react';
import {
  AlertTriangle, BookMarked, Edit3, EyeOff, FileSpreadsheet, Gauge, MapPin, Network,
  Plus, ShieldAlert, Trash2, UserCheck,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import {
  Button, DataTable, EmptyState, Modal, NeonContainer, StatusMessage, ToggleGroup,
  type Column,
} from '@/shared/ui';
import { useCatalogos, type CatalogoVista } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  CatalogoNombrado,
  CatalogoPlan,
  CatalogoPlanRegulador,
  CatalogoProductoIgnorado,
  CatalogoSite,
  CatalogoZona,
  ProductoPendiente,
  SubscriptionCatalogosProps,
} from '@/features/subscriptions/types';
import {
  IgnoradoForm, NombreForm, PlanForm, PlanReguladorForm, SiteForm, ZonaForm,
} from './CatalogoForms';

/**
 * Catálogos de referencia del negocio.
 *
 * Planes y zonas vivían en `data/Planes.json` y `data/Zonas.json`: cambiar una
 * tarifa exigía editar un fichero del repositorio y volver a desplegar. Desde
 * aquí se mantienen ellos y las tres tablas de las que cuelgan las zonas
 * (sites, estados y coordinadores).
 *
 * La primera pestaña no es un catálogo sino la lista de lo que falta: los
 * productos que ya están importados y que ningún plan reconoce. Es lo que
 * bloquea una importación o un análisis, y se resuelve desde ahí mismo.
 *
 * Las pestañas se reparten entre dos permisos: la mitad comercial (por
 * registrar, planes, reguladores, ignorados) y la operacional (zonas, sites,
 * estados, coordinadores). Solo se pintan las del permiso que se tiene; el
 * servidor tampoco envía las filas de la otra ni deja escribir en ella.
 */
export function CatalogosView({
  planes,
  reguladores,
  zonas,
  sites,
  estados,
  coordinadores,
  ignorados,
  pendientes,
  comercial,
  operacional,
  tecnologias,
  tiposPersona,
  nuevoPlan,
}: SubscriptionCatalogosProps) {
  const c = useCatalogos({ sites, estados, nuevoPlan, comercial });

  const enviar = (event: FormEvent, accion: () => void) => {
    event.preventDefault();
    accion();
  };

  const acciones = <T,>(onEdit: (row: T) => void, onDelete: (row: T) => void): Column<T> => ({
    header: 'Acciones',
    align: 'right',
    accessor: (row: T) => (
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="rounded-lg border border-sky-500/30 p-2 text-sky-400 hover:bg-sky-500/10"
          title="Editar"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(row)}
          className="rounded-lg border border-rose-500/30 p-2 text-rose-400 hover:bg-rose-500/10"
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    ),
  });

  const columnasPendientes: Column<ProductoPendiente>[] = [
    { header: 'Producto', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Órdenes', accessor: 'ordenes', align: 'right', sortKey: 'ordenes' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => c.crearPlanDesde(row.nombre)}>
            Crear plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<EyeOff className="h-4 w-4" />}
            onClick={() => c.ignorarProducto(row.nombre)}
          >
            Ignorar
          </Button>
        </div>
      ),
    },
  ];

  const columnasPlanes: Column<CatalogoPlan>[] = [
    { header: 'Plan', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Tarifa', accessor: (row) => row.tarifa || '—', sortKey: 'tarifa' },
    { header: 'Tecnología', accessor: 'tecnologia', sortKey: 'tecnologia', filterable: true },
    { header: 'Persona', accessor: 'tipo_persona', sortKey: 'tipo_persona', filterable: true },
    { header: 'Mbps', accessor: 'datas_mbps', align: 'right', sortKey: 'datas_mbps' },
    { header: 'Precio', accessor: 'precio', align: 'right', sortKey: 'precio' },
    // El filtro va por la etiqueta que se ve, no por el booleano: nadie busca
    // «false» en un desplegable que en la tabla pone «—».
    { header: 'TV', accessor: (row) => (row.tiene_tv ? 'Sí' : '—'), filterable: true, filterValue: (row) => (row.tiene_tv ? 'Sí' : 'No') },
    {
      header: 'ETA',
      accessor: (row) => (row.declarar_en_eta ? 'Declara' : 'No declara'),
      filterable: true,
      filterValue: (row) => (row.declarar_en_eta ? 'Declara' : 'No declara'),
    },
    {
      header: 'Plan regulador',
      accessor: (row) => row.plan_regulador || '— sin asignar',
      sortKey: 'plan_regulador',
      filterable: true,
      // Los planes sin asignar son justo lo que hay que encontrar para poder
      // declararlos, así que necesitan su propia opción en el desplegable.
      filterValue: (row) => row.plan_regulador || 'Sin asignar',
    },
    acciones<CatalogoPlan>(c.editarPlan, (row) =>
      c.setBorrando({ tipo: 'planes', id: row.id, nombre: row.nombre })),
  ];

  const columnasReguladores: Column<CatalogoPlanRegulador>[] = [
    { header: 'Plan declarado', accessor: 'nombre', sortKey: 'nombre' },
    {
      header: 'Hoja',
      accessor: (row) => (row.es_transporte ? 'Transporte' : 'Internet'),
      filterable: true,
      filterValue: (row) => (row.es_transporte ? 'Transporte' : 'Internet'),
    },
    { header: 'Tecnología', accessor: 'tecnologia', sortKey: 'tecnologia', filterable: true },
    { header: 'Persona', accessor: 'tipo_persona', sortKey: 'tipo_persona', filterable: true },
    { header: 'Mbps', accessor: 'datas_mbps', align: 'right', sortKey: 'datas_mbps' },
    { header: 'Precio', accessor: 'precio', align: 'right', sortKey: 'precio' },
    { header: 'TV', accessor: (row) => (row.tiene_tv ? 'Sí' : '—'), filterable: true, filterValue: (row) => (row.tiene_tv ? 'Sí' : 'No') },
    { header: 'Planes', accessor: 'planes', align: 'right', sortKey: 'planes' },
    acciones<CatalogoPlanRegulador>(c.editarRegulador, (row) =>
      c.setBorrando({ tipo: 'reguladores', id: row.id, nombre: row.nombre })),
  ];

  const columnasZonas: Column<CatalogoZona>[] = [
    { header: 'Zona', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Site', accessor: 'site', sortKey: 'site', filterable: true },
    { header: 'Estado', accessor: 'estado', sortKey: 'estado', filterable: true },
    { header: 'Tecnología', accessor: 'tecnologia', sortKey: 'tecnologia', filterable: true },
    {
      header: 'Coordinador',
      accessor: (row) => row.coordinador || '—',
      sortKey: 'coordinador',
      filterable: true,
      filterValue: (row) => row.coordinador || 'Sin coordinador',
    },
    acciones<CatalogoZona>(c.editarZona, (row) =>
      c.setBorrando({ tipo: 'zonas', id: row.id, nombre: row.nombre })),
  ];

  const columnasSites: Column<CatalogoSite>[] = [
    { header: 'Site', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Orden', accessor: 'orden', align: 'right', sortKey: 'orden' },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    acciones<CatalogoSite>(c.editarSite, (row) =>
      c.setBorrando({ tipo: 'sites', id: row.id, nombre: row.nombre })),
  ];

  const columnasNombrados = (tipo: 'estados' | 'coordinadores'): Column<CatalogoNombrado>[] => [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    acciones<CatalogoNombrado>(
      (row) => c.editarNombre(tipo, row),
      (row) => c.setBorrando({ tipo, id: row.id, nombre: row.nombre }),
    ),
  ];

  const columnasIgnorados: Column<CatalogoProductoIgnorado>[] = [
    { header: 'Producto', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Nota', accessor: (row) => row.nota || '—' },
    {
      header: 'Registrado por',
      accessor: (row) => row.creado_por || '—',
      filterable: true,
      filterValue: (row) => row.creado_por || 'Sin registrar',
    },
    { header: 'Fecha', accessor: 'creado_en', sortKey: 'creado_en' },
    acciones<CatalogoProductoIgnorado>(c.editarIgnorado, (row) =>
      c.setBorrando({ tipo: 'ignorados', id: row.id, nombre: row.nombre })),
  ];

  // La pestaña de pendientes no tiene alta propia: lo que hay ahí se resuelve
  // creando un plan o marcándolo como ignorado desde su propia fila.
  const ALTAS: Partial<Record<CatalogoVista, { label: string; onClick: () => void }>> = {
    planes: { label: 'Nuevo plan', onClick: c.nuevoPlanVacio },
    reguladores: { label: 'Nuevo plan regulador', onClick: c.nuevoRegulador },
    zonas: { label: 'Nueva zona', onClick: c.nuevaZona },
    sites: { label: 'Nuevo site', onClick: c.nuevoSite },
    estados: { label: 'Nuevo estado', onClick: () => c.nuevoNombre('estados') },
    coordinadores: { label: 'Nuevo coordinador', onClick: () => c.nuevoNombre('coordinadores') },
    ignorados: { label: 'Ignorar producto', onClick: c.nuevoIgnorado },
  };
  const alta = ALTAS[c.vista];

  return (
    <AppLayout
      title="Catálogos de Subscriptions"
      toolbar={
        <>
          <ModuleHeader module="subscriptions" activeTab="catalogos" />
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
            <ToggleGroup
              className="flex-wrap"
              activeKey={c.vista}
              onChange={(key) => c.setVista(key as CatalogoVista)}
              options={[
                ...(comercial
                  ? [
                      { key: 'pendientes', label: `Por registrar (${pendientes.length})`, icon: AlertTriangle },
                      { key: 'planes', label: `Planes (${planes.length})`, icon: BookMarked },
                      { key: 'reguladores', label: `Planes reguladores (${reguladores.length})`, icon: FileSpreadsheet },
                    ]
                  : []),
                ...(operacional
                  ? [
                      { key: 'zonas', label: `Zonas (${zonas.length})`, icon: Network },
                      { key: 'sites', label: `Sites (${sites.length})`, icon: MapPin },
                      { key: 'estados', label: `Estados (${estados.length})`, icon: MapPin },
                      { key: 'coordinadores', label: `Coordinadores (${coordinadores.length})`, icon: UserCheck },
                    ]
                  : []),
                ...(comercial
                  ? [{ key: 'ignorados', label: `Ignorados (${ignorados.length})`, icon: EyeOff }]
                  : []),
              ]}
            />

            {alta && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={alta.onClick}>
                {alta.label}
              </Button>
            )}
          </div>
        </>
      }
    >
      <StatusMessage
        status={c.error ? { type: 'error', text: c.error } : null}
        className="mb-4"
        icon={<AlertTriangle />}
      />

      {c.vista === 'pendientes' && (
        <NeonContainer
          title="Productos por registrar"
          subtitle="Están en los datos importados y ningún plan del catálogo los reconoce"
          icon={<ShieldAlert className="h-5 w-5" />}
          theme="yellow"
          noPadding
        >
          {pendientes.length === 0 ? (
            <EmptyState
              title="Todo lo importado está catalogado"
              description="Las importaciones y los análisis no tienen nada que reclamar."
              icon={<BookMarked />}
            />
          ) : (
            <DataTable columns={columnasPendientes} data={pendientes} searchable searchPlaceholder="Buscar producto..." />
          )}
        </NeonContainer>
      )}

      {c.vista === 'planes' && (
        <NeonContainer title="Planes" subtitle="Vocabulario comercial: qué productos existen y cómo se clasifican" icon={<BookMarked className="h-5 w-5" />} theme="purple" noPadding>
          <DataTable columns={columnasPlanes} data={planes} searchable searchPlaceholder="Buscar plan..." />
        </NeonContainer>
      )}

      {c.vista === 'reguladores' && (
        <NeonContainer
          title="Planes reguladores"
          subtitle="Una fila por producto declarado: es lo que se exporta en el formulario de la reguladora"
          icon={<FileSpreadsheet className="h-5 w-5" />}
          theme="purple"
          noPadding
        >
          {reguladores.length === 0 ? (
            <EmptyState
              title="Todavía no hay planes reguladores"
              description="Sin ellos el formulario sale vacío: cada plan comercial necesita saber con qué fila se declara."
              icon={<FileSpreadsheet />}
            />
          ) : (
            <DataTable
              columns={columnasReguladores}
              data={reguladores}
              searchable
              searchPlaceholder="Buscar plan declarado..."
            />
          )}
        </NeonContainer>
      )}

      {c.vista === 'zonas' && (
        <NeonContainer title="Zonas" subtitle="Nodos de red, con su site, su estado y su coordinador" icon={<Network className="h-5 w-5" />} theme="blue" noPadding>
          <DataTable columns={columnasZonas} data={zonas} searchable searchPlaceholder="Buscar zona..." />
        </NeonContainer>
      )}

      {c.vista === 'sites' && (
        <NeonContainer title="Sites" subtitle="Sedes regionales y el orden en que se presentan en los reportes" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={columnasSites} data={sites} searchable searchPlaceholder="Buscar site..." />
        </NeonContainer>
      )}

      {c.vista === 'estados' && (
        <NeonContainer title="Estados" subtitle="Entidades federales. El reporte ETA agrupa por aquí" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={columnasNombrados('estados')} data={estados} searchable searchPlaceholder="Buscar estado..." />
        </NeonContainer>
      )}

      {c.vista === 'coordinadores' && (
        <NeonContainer title="Coordinadores" subtitle="Responsables comerciales por los que agrupa Business Units" icon={<UserCheck className="h-5 w-5" />} theme="green" noPadding>
          <DataTable columns={columnasNombrados('coordinadores')} data={coordinadores} searchable searchPlaceholder="Buscar coordinador..." />
        </NeonContainer>
      )}

      {c.vista === 'ignorados' && (
        <NeonContainer
          title="Productos ignorados"
          subtitle="Routers, instalaciones y servicios puntuales que nunca serán un plan"
          icon={<EyeOff className="h-5 w-5" />}
          theme="slate"
          noPadding
        >
          <DataTable columns={columnasIgnorados} data={ignorados} searchable searchPlaceholder="Buscar producto..." />
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.planDraft)}
        onClose={c.cerrarFormularios}
        title={c.planDraft?.id ? 'Editar plan del catálogo' : 'Nuevo plan del catálogo'}
        subtitle="Única clasificación del producto: de aquí la leen los análisis y el reporte ETA"
        icon={<BookMarked className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.planDraft && (
          <PlanForm
            value={c.planDraft}
            tecnologias={tecnologias}
            tiposPersona={tiposPersona}
            reguladores={reguladores}
            saving={c.guardando}
            onChange={(patch) => c.setPlanDraft({ ...c.planDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('planes', { ...c.planDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.reguladorDraft)}
        onClose={c.cerrarFormularios}
        title={c.reguladorDraft?.id ? 'Editar plan regulador' : 'Nuevo plan regulador'}
        subtitle="Una fila del formulario de la reguladora: velocidad, renta y tipo de suscriptor declarados"
        icon={<FileSpreadsheet className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.reguladorDraft && (
          <PlanReguladorForm
            value={c.reguladorDraft}
            tecnologias={tecnologias}
            tiposPersona={tiposPersona}
            saving={c.guardando}
            onChange={(patch) => c.setReguladorDraft({ ...c.reguladorDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('reguladores', { ...c.reguladorDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.zonaDraft)}
        onClose={c.cerrarFormularios}
        title={c.zonaDraft?.id ? 'Editar zona' : 'Nueva zona'}
        subtitle="Nodo de red: site, estado y coordinador por los que se agrupa"
        icon={<Network className="h-5 w-5 text-sky-400" />}
        theme="blue"
      >
        {c.zonaDraft && (
          <ZonaForm
            value={c.zonaDraft}
            sites={sites}
            estados={estados}
            coordinadores={coordinadores}
            tecnologias={tecnologias}
            saving={c.guardando}
            onChange={(patch) => c.setZonaDraft({ ...c.zonaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('zonas', { ...c.zonaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.siteDraft)}
        onClose={c.cerrarFormularios}
        title={c.siteDraft?.id ? 'Editar site' : 'Nuevo site'}
        subtitle="Sede regional y su orden de presentación"
        icon={<MapPin className="h-5 w-5 text-slate-300" />}
        theme="slate"
        size="md"
      >
        {c.siteDraft && (
          <SiteForm
            value={c.siteDraft}
            saving={c.guardando}
            onChange={(patch) => c.setSiteDraft({ ...c.siteDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('sites', { ...c.siteDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.nombreDraft)}
        onClose={c.cerrarFormularios}
        title={c.nombreDraft?.tipo === 'coordinadores' ? 'Coordinador' : 'Estado'}
        subtitle={
          c.nombreDraft?.tipo === 'coordinadores'
            ? 'Responsable comercial de un conjunto de zonas'
            : 'Entidad federal a la que pertenecen las zonas'
        }
        icon={
          c.nombreDraft?.tipo === 'coordinadores'
            ? <UserCheck className="h-5 w-5 text-emerald-400" />
            : <Gauge className="h-5 w-5 text-emerald-400" />
        }
        theme="green"
        size="md"
      >
        {c.nombreDraft && (
          <NombreForm
            value={c.nombreDraft}
            saving={c.guardando}
            onChange={(patch) => c.setNombreDraft({ ...c.nombreDraft!, ...patch })}
            onSubmit={(e) =>
              enviar(e, () => c.guardar(c.nombreDraft!.tipo, { id: c.nombreDraft!.id, nombre: c.nombreDraft!.nombre }))
            }
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.ignoradoDraft)}
        onClose={c.cerrarFormularios}
        title="Producto ignorado"
        subtitle="Línea del export que no es un plan y no debe bloquear nada"
        icon={<EyeOff className="h-5 w-5 text-slate-300" />}
        theme="slate"
        size="md"
      >
        {c.ignoradoDraft && (
          <IgnoradoForm
            value={c.ignoradoDraft}
            saving={c.guardando}
            onChange={(patch) => c.setIgnoradoDraft({ ...c.ignoradoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('ignorados', { ...c.ignoradoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.borrando)}
        onClose={() => c.setBorrando(null)}
        title="Confirmar eliminación"
        subtitle="Esta acción no se puede deshacer"
        icon={<Trash2 className="h-5 w-5 text-rose-400" />}
        theme="red"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            ¿Eliminar <strong className="text-white">{c.borrando?.nombre}</strong> del catálogo?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => c.setBorrando(null)}>
              Cancelar
            </Button>
            <Button variant="danger" isLoading={c.guardando} onClick={c.confirmarBorrado}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
