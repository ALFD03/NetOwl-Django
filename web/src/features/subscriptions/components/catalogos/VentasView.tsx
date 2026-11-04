/** Catálogos › Ventas: el directorio de ventas, los equipos, las unidades de negocio y los objetivos. */

import { Briefcase, Crown, Tag, Target, TrafficCone, Users } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DataTable, EmptyState, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  CargoVentas,
  CatalogoEquipoVentas,
  CatalogoNombreEquipo,
  CatalogoPersonaVentas,
  CatalogoUnidadNegocio,
  CatalogosVentasProps,
} from '@/features/subscriptions/types';
import { BarraCatalogo, ConfirmarBorrado, ErrorCatalogo, columnaAcciones, enviar } from './CatalogoComun';
import { CARGO_UI, EquipoForm, NombreEquipoForm, PersonaForm, UnidadForm } from './VentasForms';
import { NIVEL_OBJETIVO_UI, ObjetivoForm, ObjetivoMesForm, SemaforoForm } from './ObjetivoForms';
import { ObjetivosPanel } from './ObjetivosPanel';
import { objetivoGeneral } from '../../lib/objetivos';

const CARGOS: CargoVentas[] = ['asesor', 'supervisor', 'coord_oficina', 'coord_un'];

/**
 * Quién vende y qué se espera de cada parte de la red.
 *
 * Una pestaña por cargo del directorio de ventas —la misma tabla, filtrada—,
 * con cómo escribe Odoo a cada persona: es contra eso que Comisiones reparte
 * cada venta. Las unidades de negocio son los «coordinadores» por los que
 * agrupa Unidades de negocio: cada una es dueña de un conjunto de zonas (se
 * asignan en Estructura) y apunta a la persona que la lleva.
 *
 * Los equipos de ventas son el literal de «Equipo de ventas», cómo se
 * presentan (de la lista de nombres de equipo) y a quién pertenecen.
 */
export function VentasView({
  personas,
  cargos,
  nuevaPersona,
  coordinadores,
  equipos,
  nombresEquipo,
  tiposEquipo,
  objetivos,
  objetivos_mes: objetivosMes,
  semaforo,
  objetivosConfig,
  periodosCalculados,
  nodosConocidos,
  zonas,
  sites,
  estados,
}: CatalogosVentasProps) {
  const c = useCatalogos({
    vistaInicial: nuevaPersona.literal ? nuevaPersona.cargo : 'asesor',
    nuevaPersona,
  });

  // El general que rige hoy, para decir en los formularios qué se hereda si
  // se deja un valor vacío. La excepción de un mes no cuenta como "heredado"
  // de ese mismo mes, de ahí la configuración sin `meses`.
  const mesReferencia = periodosCalculados[0] ?? new Date().toISOString().slice(0, 7);
  const generalHoy = objetivoGeneral(objetivosConfig, mesReferencia);
  // Solo los nodos cuya zona está en el catálogo pueden tener objetivo de nodo:
  // el objetivo cuelga de la zona. La sucursal, en cambio, vale sin catálogo.
  const nombresZona = new Set(zonas.map((z) => z.nombre.toLowerCase()));
  const nodosDelCatalogo = nodosConocidos.filter((n) => nombresZona.has(n.zona.toLowerCase()));
  const generalSinExcepcion = (periodo: string) =>
    objetivoGeneral({ ...objetivosConfig, meses: {} }, periodo || mesReferencia);

  const etiquetaCargo = (cargo: CargoVentas) => cargos.find((o) => o.value === cargo)?.label ?? cargo;
  const porCargo = (cargo: CargoVentas) => personas.filter((p) => p.cargo === cargo);
  const coordinadoresUn = porCargo('coord_un');
  const coordinadoresOficina = porCargo('coord_oficina');
  const etiquetaTipo = (tipo: string) => tiposEquipo.find((o) => o.value === tipo)?.label ?? tipo;

  const columnasPersonas = (cargo: CargoVentas): Column<CatalogoPersonaVentas>[] => [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Apellido', accessor: 'apellido', sortKey: 'apellido' },
    { header: 'Medio', accessor: 'medio', sortKey: 'medio' },
    ...(cargo !== 'asesor'
      ? [{
        header: 'Como supervisor',
        accessor: (row) => row.medio_supervisor || <span className="text-slate-500">= medio</span>,
        sortKey: 'medio_supervisor',
      } as Column<CatalogoPersonaVentas>]
      : []),
    ...(cargo === 'coord_oficina'
      ? [{ header: 'Usuario de Odoo', accessor: 'usuario_odoo', sortKey: 'usuario_odoo' } as Column<CatalogoPersonaVentas>]
      : []),
    ...(cargo === 'coord_un'
      ? [{ header: 'Unidades', accessor: (row) => row.unidades.join(', ') || '—' } as Column<CatalogoPersonaVentas>]
      : []),
    ...(cargo === 'asesor'
      ? [{
        header: 'Estado del bono',
        accessor: (row) => row.estado_fijo || <span className="text-slate-500">automático</span>,
        sortKey: 'estado_fijo',
        filterable: true,
        filterValue: (row) => row.estado_fijo || 'Automático',
      } as Column<CatalogoPersonaVentas>]
      : []),
    columnaAcciones<CatalogoPersonaVentas>(c.editarPersona, (row) =>
      c.setBorrando({ tipo: 'personas', id: row.id, nombre: `${row.nombre} ${row.apellido}` })),
  ];

  const columnasUnidades: Column<CatalogoUnidadNegocio>[] = [
    { header: 'Unidad', accessor: 'nombre', sortKey: 'nombre' },
    {
      header: 'Coordinador',
      accessor: (row) => row.persona || '— sin asignar',
      sortKey: 'persona',
      filterable: true,
      filterValue: (row) => row.persona || 'Sin asignar',
    },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    columnaAcciones<CatalogoUnidadNegocio>(c.editarUnidad, (row) =>
      c.setBorrando({ tipo: 'coordinadores', id: row.id, nombre: row.nombre })),
  ];

  const columnasEquipos: Column<CatalogoEquipoVentas>[] = [
    { header: 'Nombre en Odoo', accessor: 'nombre_odoo', sortKey: 'nombre_odoo' },
    {
      header: 'Se presenta como',
      accessor: 'nombre_visualizacion',
      sortKey: 'nombre_visualizacion',
      filterable: true,
      filterValue: (row) => row.nombre_visualizacion,
    },
    {
      header: 'Tipo',
      accessor: (row) => etiquetaTipo(row.tipo_equipo),
      sortKey: 'tipo_equipo',
      filterable: true,
      filterValue: (row) => etiquetaTipo(row.tipo_equipo),
    },
    {
      header: 'Coord. de oficina',
      accessor: 'coord_oficina',
      sortKey: 'coord_oficina',
      filterable: true,
      filterValue: (row) => row.coord_oficina,
    },
    {
      header: 'Coord. de UN',
      accessor: (row) => (row.tipo_equipo === 'externa' ? row.coord_un || '— sin asignar' : <span className="text-slate-500">no aplica</span>),
      sortKey: 'coord_un',
    },
    columnaAcciones<CatalogoEquipoVentas>(c.editarEquipo, (row) =>
      c.setBorrando({ tipo: 'equipos', id: row.id, nombre: row.nombre_odoo })),
  ];

  const columnasNombresEquipo: Column<CatalogoNombreEquipo>[] = [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Equipos', accessor: 'equipos', align: 'right', sortKey: 'equipos' },
    columnaAcciones<CatalogoNombreEquipo>(c.editarNombreEquipo, (row) =>
      c.setBorrando({ tipo: 'nombres_equipo', id: row.id, nombre: row.nombre })),
  ];

  const altas: Record<string, { label: string; onClick: () => void }> = {
    ...Object.fromEntries(CARGOS.map((cargo) => [
      cargo,
      { label: `Registrar ${etiquetaCargo(cargo).toLowerCase()}`, onClick: () => c.nuevaPersonaVacia(cargo) },
    ])),
    unidades: { label: 'Nueva unidad', onClick: c.nuevaUnidad },
    equipos: { label: 'Registrar equipo', onClick: () => c.crearEquipoDesde() },
    nombres_equipo: { label: 'Nuevo nombre', onClick: c.nuevoNombreEquipo },
  };
  const cargoActivo = CARGOS.find((cargo) => cargo === c.vista);

  return (
    <AppLayout
      toolbar={
        <BarraCatalogo
          activa={c.vista}
          onChange={(key) => c.setVista(key as typeof c.vista)}
          alta={altas[c.vista]}
          pestanas={[
            ...CARGOS.map((cargo) => ({
              key: cargo,
              label: `${CARGO_UI[cargo].corto} (${porCargo(cargo).length})`,
              icon: Briefcase,
            })),
            { key: 'equipos', label: `Equipos de ventas (${equipos.length})`, icon: Users },
            { key: 'nombres_equipo', label: `Nombres de equipo (${nombresEquipo.length})`, icon: Tag },
            { key: 'unidades', label: `Unidades de negocio (${coordinadores.length})`, icon: Crown },
            { key: 'objetivos', label: 'Objetivos', icon: Target },
          ]}
        />
      }
    >
      <ErrorCatalogo c={c} />

      {cargoActivo && (
        <NeonContainer
          title={etiquetaCargo(cargoActivo)}
          subtitle={CARGO_UI[cargoActivo].description}
          icon={<Briefcase className="h-5 w-5" />}
          theme="green"
          noPadding
        >
          {porCargo(cargoActivo).length === 0 ? (
            <EmptyState
              title="Nadie registrado con este cargo"
              description="Notificaciones lista los nombres de las suscripciones que el directorio todavía no reconoce."
              icon={<Briefcase />}
            />
          ) : (
            <DataTable
              columns={columnasPersonas(cargoActivo)}
              data={porCargo(cargoActivo)}
              searchable
              searchPlaceholder="Buscar persona..."
            />
          )}
        </NeonContainer>
      )}

      {c.vista === 'equipos' && (
        <NeonContainer
          title="Equipos de ventas"
          subtitle="Cómo aparecen en «Equipo de ventas», cómo se presentan y a qué oficina (y unidad, si son externos) pertenecen"
          icon={<Users className="h-5 w-5" />}
          theme="green"
          noPadding
        >
          {equipos.length === 0 ? (
            <EmptyState
              title="Ningún equipo registrado"
              description="Notificaciones lista los equipos de las suscripciones que el catálogo todavía no reconoce."
              icon={<Users />}
            />
          ) : (
            <DataTable columns={columnasEquipos} data={equipos} searchable searchPlaceholder="Buscar equipo..." />
          )}
        </NeonContainer>
      )}

      {c.vista === 'nombres_equipo' && (
        <NeonContainer
          title="Nombres de equipo"
          subtitle="La lista de la que se elige cómo se presenta cada equipo de ventas"
          icon={<Tag className="h-5 w-5" />}
          theme="green"
          noPadding
        >
          {nombresEquipo.length === 0 ? (
            <EmptyState
              title="Ningún nombre todavía"
              description="Crea los nombres con los que se presentarán los equipos antes de registrarlos."
              icon={<Tag />}
            />
          ) : (
            <DataTable columns={columnasNombresEquipo} data={nombresEquipo} searchable searchPlaceholder="Buscar nombre..." />
          )}
        </NeonContainer>
      )}

      {c.vista === 'unidades' && (
        <NeonContainer title="Unidades de negocio" subtitle="Los grupos de zonas de Unidades de negocio y la persona que lleva cada uno" icon={<Crown className="h-5 w-5" />} theme="green" noPadding>
          <DataTable columns={columnasUnidades} data={coordinadores} searchable searchPlaceholder="Buscar unidad..." />
        </NeonContainer>
      )}

      {c.vista === 'objetivos' && (
        <ObjetivosPanel
          objetivos={objetivos}
          objetivosMes={objetivosMes}
          semaforo={semaforo}
          config={objetivosConfig}
          periodos={periodosCalculados}
          zonas={zonas}
          nodos={nodosConocidos}
          onEditarGeneral={c.editarObjetivo}
          onNuevoObjetivo={() => c.nuevoObjetivo('zona')}
          onEditarObjetivo={c.editarObjetivo}
          onBorrarObjetivo={(fila) =>
            c.setBorrando({
              tipo: 'objetivos',
              id: fila.id,
              nombre: `el objetivo ${NIVEL_OBJETIVO_UI[fila.nivel].label.toLowerCase()} ${fila.entidad} ${fila.desde ? `desde ${fila.desde}` : 'desde siempre'}`.replace(/\s+/g, ' '),
            })}
          onExcepcionMes={(periodo, existente) =>
            (existente ? c.editarObjetivoMes(existente) : c.nuevoObjetivoMes(periodo))}
          onBorrarMes={(fila) =>
            c.setBorrando({ tipo: 'objetivos_mes', id: fila.id, nombre: `la excepción de ${fila.periodo}` })}
          onEditarSemaforo={() => c.editarSemaforo(semaforo)}
        />
      )}

      <Modal
        isOpen={Boolean(c.personaDraft)}
        onClose={c.cerrarFormularios}
        title={c.personaDraft?.id ? 'Editar persona de ventas' : 'Registrar persona de ventas'}
        subtitle="Cómo aparece en las suscripciones: es contra esto que Comisiones reparte cada venta"
        icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.personaDraft && (
          <PersonaForm
            value={c.personaDraft}
            cargos={cargos}
            estados={estados}
            saving={c.guardando}
            onChange={(patch) => c.setPersonaDraft({ ...c.personaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('personas', { ...c.personaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.equipoDraft)}
        onClose={c.cerrarFormularios}
        title={c.equipoDraft?.id ? 'Editar equipo de ventas' : 'Registrar equipo de ventas'}
        subtitle="Cómo aparece en las suscripciones, cómo se presenta y a quién pertenece"
        icon={<Users className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.equipoDraft && (
          <EquipoForm
            value={c.equipoDraft}
            nombres={nombresEquipo}
            tipos={tiposEquipo}
            coordinadoresOficina={coordinadoresOficina}
            coordinadoresUn={coordinadoresUn}
            saving={c.guardando}
            onChange={(patch) => c.setEquipoDraft({ ...c.equipoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('equipos', { ...c.equipoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.nombreEquipoDraft)}
        onClose={c.cerrarFormularios}
        title={c.nombreEquipoDraft?.id ? 'Editar nombre de equipo' : 'Nuevo nombre de equipo'}
        subtitle="Cómo se presenta un equipo de ventas"
        icon={<Tag className="h-5 w-5 text-emerald-400" />}
        theme="green"
        size="md"
      >
        {c.nombreEquipoDraft && (
          <NombreEquipoForm
            value={c.nombreEquipoDraft}
            saving={c.guardando}
            onChange={(patch) => c.setNombreEquipoDraft({ ...c.nombreEquipoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('nombres_equipo', { ...c.nombreEquipoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.unidadDraft)}
        onClose={c.cerrarFormularios}
        title={c.unidadDraft?.id ? 'Editar unidad de negocio' : 'Nueva unidad de negocio'}
        subtitle="Un conjunto de zonas y la persona que lo lleva"
        icon={<Crown className="h-5 w-5 text-emerald-400" />}
        theme="green"
        size="md"
      >
        {c.unidadDraft && (
          <UnidadForm
            value={c.unidadDraft}
            personas={coordinadoresUn}
            saving={c.guardando}
            onChange={(patch) => c.setUnidadDraft({ ...c.unidadDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('coordinadores', { ...c.unidadDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.objetivoDraft)}
        onClose={c.cerrarFormularios}
        title={c.objetivoDraft?.id ? 'Editar objetivo' : 'Nuevo objetivo'}
        subtitle="Meta de crecimiento y churn máximo. No cambia ningún análisis: solo metas, cumplimiento y colores"
        icon={<Target className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.objetivoDraft && (
          <ObjetivoForm
            value={c.objetivoDraft}
            entidades={{ zona: zonas, site: sites, estado: estados, coordinador: coordinadores }}
            nodos={nodosDelCatalogo}
            general={generalHoy}
            saving={c.guardando}
            onChange={(patch) => c.setObjetivoDraft({ ...c.objetivoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('objetivos', { ...c.objetivoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.objetivoMesDraft)}
        onClose={c.cerrarFormularios}
        title={c.objetivoMesDraft?.id ? 'Editar excepción del mes' : 'Excepción de un mes'}
        subtitle="Sustituye al objetivo general solo en ese mes"
        icon={<Target className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {c.objetivoMesDraft && (
          <ObjetivoMesForm
            value={c.objetivoMesDraft}
            periodos={periodosCalculados}
            general={generalSinExcepcion(c.objetivoMesDraft.periodo)}
            saving={c.guardando}
            onChange={(patch) => c.setObjetivoMesDraft({ ...c.objetivoMesDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('objetivos_mes', { ...c.objetivoMesDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.semaforoDraft)}
        onClose={c.cerrarFormularios}
        title="Semáforo de objetivos"
        subtitle="Desde dónde es verde, amarillo o rojo cada métrica, igual en todo el módulo"
        icon={<TrafficCone className="h-5 w-5 text-amber-400" />}
        theme="yellow"
      >
        {c.semaforoDraft && (
          <SemaforoForm
            value={c.semaforoDraft}
            saving={c.guardando}
            onChange={(patch) => c.setSemaforoDraft({ ...c.semaforoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('semaforo', { ...c.semaforoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <ConfirmarBorrado c={c} />
    </AppLayout>
  );
}
