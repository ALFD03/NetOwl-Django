/** Catálogos › Ventas: la estructura de ventas, los equipos con su gente y sus condiciones, y los objetivos. */

import { Banknote, Briefcase, Building, Crown, MapPin, Plus, Target, TrafficCone, Users } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, EmptyState, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  CatalogoEquipoVentas,
  CatalogoMembresia,
  CatalogoObjetivoOficina,
  CatalogoPersonaVentas,
  CatalogoSite,
  CatalogoUnidadNegocio,
  CatalogosVentasProps,
  RolVentas,
} from '@/features/subscriptions/types';
import { BarraCatalogo, ConfirmarBorrado, ErrorCatalogo, columnaAcciones, enviar } from './CatalogoComun';
import { CondicionesForm, CondicionesRolCard } from './CondicionesRol';
import { MembresiaForm, ObjetivoOficinaForm, ROL_UI, SiteForm, UnidadForm } from './VentasForms';
import { NIVEL_OBJETIVO_UI, ObjetivoForm, ObjetivoMesForm, SemaforoForm } from './ObjetivoForms';
import { ObjetivosPanel } from './ObjetivosPanel';
import { ZonasSinObjetivoPanel } from './ZonasSinObjetivo';
import { objetivoGeneral } from '../../lib/objetivos';

/**
 * Quién vende, cómo cobra y qué se espera de cada parte de la red.
 *
 * Dos niveles de pestañas. **Estructura de ventas**: las unidades de negocio y
 * los sites (con las zonas y los equipos que los trabajan) y los objetivos.
 * Después, **un grupo por equipo de ventas** (Verticalización, Carabobo...): una
 * pestaña por rol con su gente —cómo la escribe Odoo, contra lo que Comisiones
 * reparte cada venta— y, a su derecha, las condiciones de pago de ese rol.
 *
 * La pestaña activa viaja como `seccion/subpantalla` (`estructura/sites`,
 * `carabobo/supervisor`, `aragua/asesor`).
 */

const ESTRUCTURA = 'estructura';

/** Las ventas del tramo vigente en `mes`: el más reciente que ya empezó (`coordinadoras_oficina.objetivo_vigente`). */
function objetivoVigente(tramos: CatalogoObjetivoOficina[], mes: string): CatalogoObjetivoOficina | null {
  let mejor: CatalogoObjetivoOficina | null = null;
  for (const t of tramos) {
    if (t.desde && t.desde > mes) continue;
    if (!mejor || (mejor.desde || '') <= (t.desde || '')) mejor = t;
  }
  return mejor;
}

/** El nombre principal y, en gris, los otros con los que Odoo escribe a la misma persona. */
function conOtros(principal: string, otros: string[]) {
  if (otros.length === 0) return principal;
  return (
    <>
      {principal}
      <span className="text-slate-500"> · también «{otros.join('», «')}»</span>
    </>
  );
}

export function VentasView({
  equipos,
  membresias,
  personas,
  condiciones,
  nuevaPersona,
  coordinadores,
  objetivos,
  objetivosOficina,
  zonasSinObjetivo,
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
    vistaInicial: nuevaPersona.literal && nuevaPersona.equipo ? `${nuevaPersona.equipo}/${nuevaPersona.rol}` : `${ESTRUCTURA}/unidades`,
    nuevaPersona,
    equipos,
    sites,
  });
  const [seccion, sub = ''] = c.vista.split('/');
  const equipo = equipos.find((e) => e.slug === seccion);

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

  // El objetivo de ventas que rige este mes para cada coordinadora: el suyo o el general.
  const mesActual = new Date().toISOString().slice(0, 7);
  const generalOficina = objetivoVigente(objetivosOficina.filter((o) => o.persona_id === null), mesActual);
  const vigenteDe = (personaId: number) =>
    objetivoVigente(objetivosOficina.filter((o) => o.persona_id === personaId), mesActual) ?? generalOficina;
  const coordinadorasOficina: CatalogoPersonaVentas[] = personas.filter((p) =>
    p.membresias.some((m) => m.rol === 'coord_oficina'));

  const delRol = (e: CatalogoEquipoVentas, rol: RolVentas) =>
    membresias.filter((m) => m.equipo === e.slug && m.rol === rol);

  const columnasMembresias = (e: CatalogoEquipoVentas, rol: RolVentas): Column<CatalogoMembresia>[] => {
    const spec = e.roles.find((r) => r.rol === rol)!;
    const columnas: Column<CatalogoMembresia>[] = [
      { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
      { header: 'Apellido', accessor: 'apellido', sortKey: 'apellido' },
    ];
    if (spec.medio) columnas.push({ header: 'Medio', accessor: (row) => conOtros(row.medio, row.alias_medio), sortKey: 'medio' });
    if (spec.supervisor) {
      columnas.push({
        header: 'Como supervisor',
        accessor: (row) => conOtros(row.medio_supervisor || '', row.alias_supervisor) || <span className="text-slate-500">= medio</span>,
        sortKey: 'medio_supervisor',
      });
    }
    if (spec.usuario) columnas.push({ header: 'Usuario de Odoo', accessor: (row) => conOtros(row.usuario_odoo, row.alias_usuario), sortKey: 'usuario_odoo' });
    if (spec.site) {
      columnas.push({
        header: 'Sites',
        accessor: (row) => row.sites.join(', ') || <span className="text-amber-400">sin site</span>,
        filterable: true,
        filterValue: (row) => row.sites.join(', ') || 'Sin site',
      });
      columnas.push({
        header: `Objetivo ${mesActual}`,
        accessor: (row) => {
          const vigente = vigenteDe(row.persona_id);
          if (!vigente) return <span className="text-slate-500">sin objetivo</span>;
          return `${vigente.ventas} ventas${vigente.persona_id === null ? ' (general)' : ''}`;
        },
        align: 'right',
      });
    }
    if (spec.superior) {
      columnas.push({
        header: 'Responde a',
        accessor: (row) => row.superior || <span className="text-amber-400">sin asignar</span>,
        sortKey: 'superior',
        filterable: true,
        filterValue: (row) => row.superior || 'Sin asignar',
      });
    }
    if (spec.unidades) columnas.push({ header: 'Unidades', accessor: (row) => row.unidades.join(', ') || '—' });
    columnas.push(columnaAcciones<CatalogoMembresia>(c.editarPersona, (row) =>
      c.setBorrando({ tipo: 'membresias', id: row.id, nombre: `${row.nombre} ${row.apellido} de ${e.nombre}` })));
    return columnas;
  };

  const columnasUnidades: Column<CatalogoUnidadNegocio>[] = [
    { header: 'Unidad', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Equipos', accessor: (row) => row.equipos.join(', ') || '—', filterable: true, filterValue: (row) => row.equipos.join(', ') || 'Ninguno' },
    {
      header: 'Quién la lleva',
      accessor: (row) => (row.responsables.length
        ? row.responsables.map((r) => `${r.persona} (${r.etiqueta}, ${r.equipo})`).join(' · ')
        : <span className="text-slate-500">— nadie</span>),
    },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    columnaAcciones<CatalogoUnidadNegocio>(c.editarUnidad, (row) =>
      c.setBorrando({ tipo: 'coordinadores', id: row.id, nombre: row.nombre })),
  ];

  const columnasSites: Column<CatalogoSite>[] = [
    { header: 'Site', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Orden', accessor: 'orden', align: 'right', sortKey: 'orden' },
    { header: 'Equipos', accessor: (row) => row.equipos.join(', ') || '—' },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    columnaAcciones<CatalogoSite>(c.editarSite, (row) =>
      c.setBorrando({ tipo: 'sites', id: row.id, nombre: row.nombre })),
  ];

  const columnasObjetivosOficina: Column<CatalogoObjetivoOficina>[] = [
    {
      header: 'Para',
      accessor: (row) => row.persona || <span className="font-semibold text-sky-300">General</span>,
      sortKey: 'persona',
      filterable: true,
      filterValue: (row) => row.persona || 'General',
    },
    { header: 'Desde', accessor: (row) => row.desde || 'siempre', sortKey: 'desde' },
    { header: 'Ventas al mes', accessor: 'ventas', align: 'right', sortKey: 'ventas' },
    { header: 'Nota', accessor: (row) => row.nota || <span className="text-slate-600">—</span> },
    {
      header: 'Actualizado',
      accessor: (row) => `${row.actualizado_en}${row.actualizado_por ? ` · ${row.actualizado_por}` : ''}`,
      sortKey: 'actualizado_en',
    },
    columnaAcciones<CatalogoObjetivoOficina>(c.editarObjetivoOficina, (row) =>
      c.setBorrando({
        tipo: 'objetivos_oficina',
        id: row.id,
        nombre: `el objetivo de ventas ${row.persona ? `de ${row.persona}` : 'general'} ${row.desde ? `desde ${row.desde}` : 'desde siempre'}`,
      })),
  ];

  // --- Pestañas y altas de la sección abierta ---
  const pestanasEstructura = [
    { key: `${ESTRUCTURA}/unidades`, label: `Unidades de negocio (${coordinadores.length})`, icon: Crown },
    { key: `${ESTRUCTURA}/sites`, label: `Sites (${sites.length})`, icon: MapPin },
    { key: `${ESTRUCTURA}/objetivos`, label: 'Objetivos', icon: Target },
  ];
  const pestanasEquipo = equipo
    ? [
      ...equipo.roles.map((r) => ({
        key: `${equipo.slug}/${r.rol}`,
        label: `${ROL_UI[r.rol].corto} (${delRol(equipo, r.rol).length})`,
        icon: Briefcase,
      })),
    ]
    : [];

  const rolActivo = equipo?.roles.find((r) => r.rol === sub);
  const alta = (() => {
    if (seccion === ESTRUCTURA && sub === 'unidades') return { label: 'Nueva unidad', onClick: c.nuevaUnidad };
    if (seccion === ESTRUCTURA && sub === 'sites') return { label: 'Nuevo site', onClick: c.nuevoSite };
    if (equipo && rolActivo) {
      return {
        label: `Registrar ${rolActivo.etiqueta.toLowerCase()}`,
        onClick: () => c.nuevaPersonaVacia(rolActivo.rol, equipo.id, equipo.slug),
      };
    }
    return undefined;
  })();

  const primeraSubpantalla = (slug: string) =>
    (slug === ESTRUCTURA ? 'unidades' : (equipos.find((e) => e.slug === slug)?.roles[0]?.rol ?? ''));

  // Lo que pide el formulario de la persona abierta.
  const equipoDraft = equipos.find((e) => e.slug === c.personaDraft?.equipo);
  const rolDraft = equipoDraft?.roles.find((r) => r.rol === c.personaDraft?.rol);

  return (
    <AppLayout
      toolbar={
        <BarraCatalogo
          activa={seccion}
          onChange={(key) => c.setVista(`${key}/${primeraSubpantalla(key)}`)}
          pestanas={[
            { key: ESTRUCTURA, label: 'Estructura de ventas', icon: Building },
            ...equipos.map((e) => ({ key: e.slug, label: e.nombre, icon: Users })),
          ]}
        />
      }
    >
      <ErrorCatalogo c={c} />

      <BarraCatalogo
        activa={c.vista}
        onChange={c.setVista}
        alta={alta}
        pestanas={seccion === ESTRUCTURA ? pestanasEstructura : pestanasEquipo}
      />

      {seccion === ESTRUCTURA && sub === 'unidades' && (
        <NeonContainer title="Unidades de negocio" subtitle="Los grupos de zonas de Unidades de negocio, los equipos que los trabajan y quien los lleva" icon={<Crown className="h-5 w-5" />} theme="green" noPadding>
          <DataTable columns={columnasUnidades} data={coordinadores} searchable searchPlaceholder="Buscar unidad..." />
        </NeonContainer>
      )}

      {seccion === ESTRUCTURA && sub === 'sites' && (
        <NeonContainer title="Sites" subtitle="Sedes regionales: lo que muestra el Sales Report, con las zonas y los equipos que las trabajan" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={columnasSites} data={sites} searchable searchPlaceholder="Buscar site..." />
        </NeonContainer>
      )}

      {equipo && rolActivo && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <NeonContainer
            title={`${rolActivo.etiqueta} · ${equipo.nombre}`}
            subtitle={ROL_UI[rolActivo.rol].description}
            icon={<Briefcase className="h-5 w-5" />}
            theme="green"
            noPadding
          >
            {delRol(equipo, rolActivo.rol).length === 0 ? (
              <EmptyState
                title="Nadie registrado con este rol"
                description="Notificaciones lista los nombres de las suscripciones que el directorio todavía no reconoce."
                icon={<Briefcase />}
              />
            ) : (
              <DataTable
                columns={columnasMembresias(equipo, rolActivo.rol)}
                data={delRol(equipo, rolActivo.rol)}
                searchable
                searchPlaceholder="Buscar persona..."
              />
            )}
          </NeonContainer>

          <NeonContainer
            title="Condiciones de pago"
            subtitle={`Cómo cobra ${rolActivo.etiqueta.toLowerCase()} en ${equipo.nombre}`}
            icon={<Banknote className="h-5 w-5" />}
            theme="purple"
            noPadding
          >
            <CondicionesRolCard
              condicion={condiciones.find((x) => x.equipo === equipo.slug && x.rol === rolActivo.rol)}
              onEditar={c.editarCondicion}
              onRestablecer={(fila) => {
                if (fila.id === null) {
                  c.setError('Ese rol ya paga con las condiciones de la política.');
                  return;
                }
                c.setBorrando({ tipo: 'condiciones_equipo', id: fila.id, nombre: `las condiciones editadas de ${fila.etiqueta} en ${equipo.nombre} (vuelve a la política)` });
              }}
            />
          </NeonContainer>
        </div>
      )}

      {seccion === ESTRUCTURA && sub === 'objetivos' && (
        <>
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

          <ZonasSinObjetivoPanel
            filas={zonasSinObjetivo}
            zonas={zonas}
            onBorrar={(fila) => c.setBorrando({
              tipo: 'zonas_sin_objetivo',
              id: fila.id,
              nombre: `el tramo sin objetivo de ${fila.zona} (vuelve a medirse en todos sus meses)`,
            })}
          />

          <NeonContainer
            className="mt-8"
            title="Objetivo de ventas de las coordinadoras de oficina"
            subtitle="Cuántas ventas al mes se esperan de cada una. Se mide contra él lo que vendió ella misma («Medio»); el individual manda sobre el general"
            icon={<Building className="h-5 w-5" />}
            theme="purple"
            noPadding
            headerAction={
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => c.nuevoObjetivoOficina()}>
                Nuevo objetivo de ventas
              </Button>
            }
          >
            {objetivosOficina.length === 0 ? (
              <EmptyState
                title="Ningún objetivo de ventas todavía"
                description="Crea uno general para todas las coordinadoras y, si alguna tiene uno distinto, el suyo."
                icon={<Target />}
              />
            ) : (
              <DataTable columns={columnasObjetivosOficina} data={objetivosOficina} searchable searchPlaceholder="Buscar coordinadora..." />
            )}
          </NeonContainer>
        </>
      )}

      <Modal
        isOpen={Boolean(c.personaDraft && equipoDraft && rolDraft)}
        onClose={c.cerrarFormularios}
        title={c.personaDraft?.id ? 'Editar persona del equipo' : 'Registrar persona en el equipo'}
        subtitle="Cómo aparece en las suscripciones: es contra esto que Comisiones reparte cada venta"
        icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.personaDraft && equipoDraft && rolDraft && (
          <MembresiaForm
            value={c.personaDraft}
            equipos={equipos}
            equipo={equipoDraft}
            rol={rolDraft}
            personas={personas}
            membresias={membresias}
            sites={sites}
            unidades={coordinadores}
            saving={c.guardando}
            onChange={(patch) => c.setPersonaDraft({ ...c.personaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('membresias', { ...c.personaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.condicionDraft)}
        onClose={c.cerrarFormularios}
        title="Condiciones de pago"
        subtitle="Solo afecta a lo que se calcule después"
        icon={<Banknote className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.condicionDraft && (
          <CondicionesForm
            value={c.condicionDraft}
            saving={c.guardando}
            onChange={(patch) => c.setCondicionDraft({ ...c.condicionDraft!, ...patch })}
            onSubmit={(e) =>
              enviar(e, () => c.guardar('condiciones_equipo', {
                equipo_id: c.condicionDraft!.equipo_id,
                rol: c.condicionDraft!.rol,
                parametros: c.condicionDraft!.parametros,
              }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.objetivoOficinaDraft)}
        onClose={c.cerrarFormularios}
        title={c.objetivoOficinaDraft?.id ? 'Editar objetivo de ventas' : 'Nuevo objetivo de ventas'}
        subtitle="Cuántas ventas al mes se esperan de una coordinadora de oficina"
        icon={<Building className="h-5 w-5 text-purple-400" />}
        theme="purple"
        size="md"
      >
        {c.objetivoOficinaDraft && (
          <ObjetivoOficinaForm
            value={c.objetivoOficinaDraft}
            coordinadoras={coordinadorasOficina}
            saving={c.guardando}
            onChange={(patch) => c.setObjetivoOficinaDraft({ ...c.objetivoOficinaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('objetivos_oficina', { ...c.objetivoOficinaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.unidadDraft)}
        onClose={c.cerrarFormularios}
        title={c.unidadDraft?.id ? 'Editar unidad de negocio' : 'Nueva unidad de negocio'}
        subtitle="Un conjunto de zonas y los equipos de ventas que lo trabajan"
        icon={<Crown className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.unidadDraft && (
          <UnidadForm
            value={c.unidadDraft}
            zonas={zonas}
            equipos={equipos}
            saving={c.guardando}
            onChange={(patch) => c.setUnidadDraft({ ...c.unidadDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('coordinadores', { ...c.unidadDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.siteDraft)}
        onClose={c.cerrarFormularios}
        title={c.siteDraft?.id ? 'Editar site' : 'Nuevo site'}
        subtitle="Sede regional, sus zonas y los equipos que la trabajan"
        icon={<MapPin className="h-5 w-5 text-slate-300" />}
        theme="slate"
      >
        {c.siteDraft && (
          <SiteForm
            value={c.siteDraft}
            zonas={zonas}
            equipos={equipos}
            saving={c.guardando}
            onChange={(patch) => c.setSiteDraft({ ...c.siteDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('sites', { ...c.siteDraft }))}
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
