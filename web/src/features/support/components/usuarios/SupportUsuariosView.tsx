/** El directorio de usuarios de soporte: quién puede crear o atender un ticket. */

import type { FormEvent } from 'react';
import {
  AlertTriangle, ArrowRightLeft, Building2, Contact, Edit3, Plus, Trash2, UserCheck, UserPlus,
  Users, UserX,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
import {
  Button, DataTable, EmptyState, Modal, NeonContainer, StatusMessage, ToggleGroup,
  type Column,
} from '@/shared/ui';
import {
  useSupportUsuarios,
  type DirectorioVista,
} from '@/features/support/hooks/useSupportUsuarios';
import type {
  DepartamentoSoporte,
  SupportUsersProps,
  UsuarioPendiente,
  UsuarioSoporte,
  UsuarioTrasBaja,
} from '@/features/support/types';
import { BajaForm, CambioDepartamentoForm, DepartamentoForm, UsuarioForm, fechaCorta } from './UsuarioForms';

/**
 * Directorio de usuarios de soporte.
 *
 * El export de Odoo identifica a una persona por el literal de las columnas
 * «Asignado a» y «Creado por», y ese literal es lo único con lo que agrupan las
 * dimensiones del análisis: un nombre escrito de dos maneras son dos técnicos
 * distintos en el reporte y nada avisa. Aquí se registra la forma buena.
 *
 * La primera pestaña no es un catálogo sino la diferencia: nombres que ya
 * aparecen en los tickets importados y que el directorio no reconoce. A
 * diferencia de los planes, esto no bloquea ningún análisis; es una lista para
 * repasar.
 */
export function SupportUsuariosView({
  usuarios,
  departamentos,
  pendientes,
  trasBaja,
  sufijo,
  nuevoUsuario,
}: SupportUsersProps) {
  const d = useSupportUsuarios({ departamentos, nuevoUsuario });

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

  const columnasPendientes: Column<UsuarioPendiente>[] = [
    { header: 'Nombre en los tickets', accessor: 'literal', sortKey: 'literal' },
    { header: 'Asignados', accessor: 'asignados', align: 'right', sortKey: 'asignados' },
    { header: 'Creados', accessor: 'creados', align: 'right', sortKey: 'creados' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => d.crearUsuarioDesde(row.nombre_odoo)}
          >
            Registrar
          </Button>
        </div>
      ),
    },
  ];

  const botonFila = 'rounded-lg border p-2';

  const columnasUsuarios: Column<UsuarioSoporte>[] = [
    { header: 'Nombre en Odoo', accessor: 'nombre_odoo', sortKey: 'nombre_odoo' },
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Apellido', accessor: (row) => row.apellido || '—', sortKey: 'apellido' },
    {
      header: 'Departamento',
      accessor: (row) => (
        <span>
          {row.departamento}
          {row.historial.length > 1 && (
            <span className="ml-2 text-[10px] text-slate-500" title="Departamentos por los que ha pasado">
              ({row.historial.length})
            </span>
          )}
        </span>
      ),
      sortKey: 'departamento',
      filterable: true,
    },
    { header: 'Ingreso', accessor: (row) => fechaCorta(row.fecha_ingreso), sortKey: 'fecha_ingreso' },
    {
      header: 'Estado',
      accessor: (row) =>
        row.activo ? (
          <span className="text-emerald-400">Activo</span>
        ) : (
          <span className="text-rose-400">Baja · {fechaCorta(row.fecha_egreso)}</span>
        ),
      sortKey: 'activo',
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => d.editarUsuario(row)}
            className={`${botonFila} border-sky-500/30 text-sky-400 hover:bg-sky-500/10`}
            title="Editar"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => d.abrirCambio(row)}
            disabled={!row.activo}
            className={`${botonFila} border-violet-500/30 text-violet-400 hover:bg-violet-500/10 disabled:opacity-30`}
            title={row.activo ? 'Cambiar departamento' : 'Dado de baja: reactívalo antes de moverlo'}
          >
            <ArrowRightLeft className="h-4 w-4" />
          </button>
          {row.activo ? (
            <button
              type="button"
              onClick={() => d.abrirBaja(row)}
              className={`${botonFila} border-amber-500/30 text-amber-400 hover:bg-amber-500/10`}
              title="Dar de baja"
            >
              <UserX className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => d.mover('reactivar', row.id)}
              disabled={d.guardando}
              className={`${botonFila} border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10`}
              title="Reactivar"
            >
              <UserCheck className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => d.setBorrando({ tipo: 'usuarios', id: row.id, nombre: row.nombre_odoo })}
            className={`${botonFila} border-rose-500/30 text-rose-400 hover:bg-rose-500/10`}
            title="Eliminar (solo para registros hechos por error; para una salida, dar de baja)"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const columnasTrasBaja: Column<UsuarioTrasBaja>[] = [
    { header: 'Usuario', accessor: 'nombre_odoo', sortKey: 'nombre_odoo' },
    { header: 'Baja', accessor: (row) => fechaCorta(row.fecha_egreso), sortKey: 'fecha_egreso' },
    { header: 'Asignados', accessor: 'asignados', align: 'right', sortKey: 'asignados' },
    { header: 'Creados', accessor: 'creados', align: 'right', sortKey: 'creados' },
    { header: 'Último ticket', accessor: (row) => fechaCorta(row.ultimo), sortKey: 'ultimo' },
  ];

  const columnasDepartamentos: Column<DepartamentoSoporte>[] = [
    { header: 'Departamento', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Usuarios', accessor: 'usuarios', align: 'right', sortKey: 'usuarios' },
    acciones<DepartamentoSoporte>(d.editarDepartamento, (row) =>
      d.setBorrando({ tipo: 'departamentos', id: row.id, nombre: row.nombre })),
  ];

  // La pestaña de pendientes no tiene alta propia: lo que hay ahí se resuelve
  // registrando el usuario desde su propia fila, con el nombre ya copiado.
  const ALTAS: Partial<Record<DirectorioVista, { label: string; onClick: () => void }>> = {
    usuarios: { label: 'Nuevo usuario', onClick: d.nuevoUsuarioVacio },
    departamentos: { label: 'Nuevo departamento', onClick: d.nuevoDepartamento },
  };
  const alta = ALTAS[d.vista];

  return (
    <AppLayout
      title="Usuarios de Soporte"
      toolbar={
        <>
          <ModuleHeader module="support" activeTab="usuarios" />
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
            <ToggleGroup
              activeKey={d.vista}
              onChange={(key) => d.setVista(key as DirectorioVista)}
              options={[
                { key: 'pendientes', label: `Por registrar (${pendientes.length})`, icon: AlertTriangle },
                { key: 'trasBaja', label: `Tras la baja (${trasBaja.length})`, icon: UserX },
                { key: 'usuarios', label: `Usuarios (${usuarios.length})`, icon: Contact },
                { key: 'departamentos', label: `Departamentos (${departamentos.length})`, icon: Building2 },
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
        status={d.error ? { type: 'error', text: d.error } : null}
        className="mb-4"
        icon={<AlertTriangle />}
      />

      {d.vista === 'pendientes' && (
        <NeonContainer
          title="Usuarios por registrar"
          subtitle="Firman o atienden tickets ya importados y el directorio no los reconoce"
          icon={<AlertTriangle className="h-5 w-5" />}
          theme="yellow"
          noPadding
        >
          {pendientes.length === 0 ? (
            <EmptyState
              title="Todo el mundo está registrado"
              description="Ningún nombre de los tickets importados falta en el directorio."
              icon={<Contact />}
            />
          ) : (
            <DataTable
              columns={columnasPendientes}
              data={pendientes}
              searchable
              searchPlaceholder="Buscar nombre..."
            />
          )}
        </NeonContainer>
      )}

      {d.vista === 'trasBaja' && (
        <NeonContainer
          title="Tickets tras la baja"
          subtitle="Usuarios dados de baja con tickets creados después de su egreso: hay que reasignarlos en Odoo"
          icon={<UserX className="h-5 w-5" />}
          theme="red"
          noPadding
        >
          {trasBaja.length === 0 ? (
            <EmptyState
              title="Ningún ticket tras una baja"
              description="Nadie dado de baja figura en tickets creados después de su fecha de egreso."
              icon={<UserCheck />}
            />
          ) : (
            <DataTable
              columns={columnasTrasBaja}
              data={trasBaja}
              searchable
              searchPlaceholder="Buscar usuario..."
            />
          )}
        </NeonContainer>
      )}

      {d.vista === 'usuarios' && (
        <NeonContainer
          title="Usuarios"
          subtitle="A quién se le puede asignar un ticket y quién puede crearlo"
          icon={<Contact className="h-5 w-5" />}
          theme="blue"
          noPadding
        >
          {usuarios.length === 0 ? (
            <EmptyState
              title="El directorio está vacío"
              description="Regístralos desde la pestaña de pendientes o dando de alta uno a mano."
              icon={<Users />}
            />
          ) : (
            <DataTable
              columns={columnasUsuarios}
              data={usuarios}
              searchable
              searchPlaceholder="Buscar usuario..."
            />
          )}
        </NeonContainer>
      )}

      {d.vista === 'departamentos' && (
        <NeonContainer
          title="Departamentos"
          subtitle="Áreas por las que se agrupa el directorio. Se eligen de la lista, no se escriben"
          icon={<Building2 className="h-5 w-5" />}
          theme="slate"
          noPadding
        >
          {departamentos.length === 0 ? (
            <EmptyState
              title="Todavía no hay departamentos"
              description="Sin al menos uno no se puede registrar un usuario: el departamento es obligatorio."
              icon={<Building2 />}
            />
          ) : (
            <DataTable
              columns={columnasDepartamentos}
              data={departamentos}
              searchable
              searchPlaceholder="Buscar departamento..."
            />
          )}
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(d.usuarioDraft)}
        onClose={d.cerrarFormularios}
        title={d.usuarioDraft?.id ? 'Editar usuario de soporte' : 'Nuevo usuario de soporte'}
        subtitle="El nombre exacto con el que la persona aparece en el export, más su ficha"
        icon={<Contact className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="lg"
      >
        {d.usuarioDraft && (
          <UsuarioForm
            value={d.usuarioDraft}
            departamentos={departamentos}
            sufijo={sufijo}
            saving={d.guardando}
            onChange={(patch) => d.setUsuarioDraft({ ...d.usuarioDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => d.guardar('usuarios', { ...d.usuarioDraft }))}
            onClose={d.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(d.departamentoDraft)}
        onClose={d.cerrarFormularios}
        title={d.departamentoDraft?.id ? 'Editar departamento' : 'Nuevo departamento'}
        subtitle="Área a la que pertenecen los usuarios del directorio"
        icon={<Building2 className="h-5 w-5 text-slate-300" />}
        theme="slate"
        size="md"
      >
        {d.departamentoDraft && (
          <DepartamentoForm
            value={d.departamentoDraft}
            saving={d.guardando}
            onChange={(patch) => d.setDepartamentoDraft({ ...d.departamentoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => d.guardar('departamentos', { ...d.departamentoDraft }))}
            onClose={d.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(d.cambioDraft)}
        onClose={d.cerrarFormularios}
        title="Cambiar departamento"
        subtitle={d.cambioDraft?.usuario.nombre_odoo}
        icon={<ArrowRightLeft className="h-5 w-5 text-violet-400" />}
        theme="purple"
        size="lg"
      >
        {d.cambioDraft && (
          <CambioDepartamentoForm
            value={d.cambioDraft}
            departamentos={departamentos}
            saving={d.guardando}
            onChange={(patch) => d.setCambioDraft({ ...d.cambioDraft!, ...patch })}
            onSubmit={(e) =>
              enviar(e, () =>
                d.mover('cambiar_departamento', d.cambioDraft!.usuario.id, {
                  departamento_id: d.cambioDraft!.departamento_id,
                  fecha: d.cambioDraft!.fecha,
                }),
              )
            }
            onDeshacer={() => d.mover('deshacer_cambio', d.cambioDraft!.usuario.id)}
            onClose={d.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(d.bajaDraft)}
        onClose={d.cerrarFormularios}
        title="Dar de baja"
        subtitle="El usuario no se borra"
        icon={<UserX className="h-5 w-5 text-rose-400" />}
        theme="red"
        size="md"
      >
        {d.bajaDraft && (
          <BajaForm
            value={d.bajaDraft}
            saving={d.guardando}
            onChange={(patch) => d.setBajaDraft({ ...d.bajaDraft!, ...patch })}
            onSubmit={(e) =>
              enviar(e, () => d.mover('baja', d.bajaDraft!.usuario.id, { fecha: d.bajaDraft!.fecha }))
            }
            onClose={d.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(d.borrando)}
        onClose={() => d.setBorrando(null)}
        title="Confirmar eliminación"
        subtitle="Esta acción no se puede deshacer"
        icon={<Trash2 className="h-5 w-5 text-rose-400" />}
        theme="red"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            ¿Eliminar <strong className="text-white">{d.borrando?.nombre}</strong> del directorio?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => d.setBorrando(null)}>
              Cancelar
            </Button>
            <Button variant="danger" isLoading={d.guardando} onClick={d.confirmarBorrado}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
