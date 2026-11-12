/** Catálogos › Notificaciones: lo pendiente de cada área y lo que se decidió ignorar. */

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, BookMarked, Briefcase, EyeOff, Link2, Network, Plus, ShieldAlert, UserPlus, X } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, EmptyState, Modal, NeonContainer, SelectMenu, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  AreaCatalogo,
  CatalogoProductoIgnorado,
  CatalogosNotificacionesProps,
  ColumnaVentas,
  PersonaPendiente,
  ProductoPendiente,
  RolVentas,
} from '@/features/subscriptions/types';
import { IgnoradoForm, PlanForm, ZonaForm } from './CatalogoForms';
import { MembresiaForm, ROL_UI } from './VentasForms';
import { BarraCatalogo, ConfirmarBorrado, ErrorCatalogo, columnaAcciones, enviar } from './CatalogoComun';

/**
 * Altura del área que hace scroll en cada tabla. Con el scroll dentro de la
 * tabla y no en la página, los filtros, el buscador y la cabecera quedan
 * siempre a la vista mientras se recorren las filas.
 */
const SCROLL_TABLA = 'max-h-[60vh]';

/** Cómo se presenta la lista de pendientes de cada área. */
const LISTAS: Record<Exclude<AreaCatalogo, 'ventas'>, {
  titulo: string;
  subtitulo: string;
  columna: string;
  icon: ReactNode;
  vacia: string;
  /** El botón que abre el alta, con el nombre ya escrito en el formulario. */
  registrar: string;
}> = {
  productos: {
    titulo: 'Productos por registrar',
    subtitulo: 'Están en los datos importados y ningún plan del catálogo los reconoce. Bloquean importaciones y análisis',
    columna: 'Producto',
    icon: <BookMarked className="h-5 w-5" />,
    vacia: 'Todo lo importado está catalogado: las importaciones y los análisis no tienen nada que reclamar.',
    registrar: 'Crear plan',
  },
  estructura: {
    titulo: 'Zonas por registrar',
    subtitulo: 'Las traen las suscripciones y no están en el catálogo: sus órdenes quedan sin site, estado ni coordinador',
    columna: 'Zona',
    icon: <Network className="h-5 w-5" />,
    vacia: 'Todas las zonas de las suscripciones están en el catálogo.',
    registrar: 'Crear zona',
  },
};

/** Cómo se llama en pantalla cada columna del export que nombra a alguien de ventas. */
const COLUMNA_VENTAS: Record<ColumnaVentas, string> = {
  vendedor: 'Vendedor',
  medio_supervisor: 'Supervisor',
  medio: 'Medio',
};

/** Dónde se guarda como otro nombre de la persona lo que aparece en cada columna del export. */
const ALIAS_DE_COLUMNA = {
  medio: 'alias_medio',
  medio_supervisor: 'alias_supervisor',
  vendedor: 'alias_usuario',
} as const;

/** El rol tal y como se sugiere al registrar. */
const rolSugerido = (rol: PersonaPendiente['rol']) => ROL_UI[rol].corto;

/**
 * La bandeja del módulo. «Por registrar» es lo que está en los datos y
 * ninguna fila del catálogo reconoce, área por área; cada nombre se resuelve
 * desde su fila, registrándolo o declarando que nunca lo será. «Ignorados»
 * son esas declaraciones, para poder deshacerlas.
 *
 * Solo aparecen las áreas que el usuario administra: el servidor manda `null`
 * en las demás, que es distinto de una lista vacía ("todo registrado").
 *
 * **Se registra aquí mismo.** El alta de un plan, una zona o una persona se
 * abre en un modal con el nombre ya escrito y, al guardar, la página se
 * recarga sin moverse: la fila desaparece de su lista y se sigue con la
 * siguiente. Ir a la página del grupo obligaba a volver después de cada una.
 */
export function NotificacionesView({ pendientes, ignorados, areas, opciones }: CatalogosNotificacionesProps) {
  const c = useCatalogos({ vistaInicial: 'pendientes', sites: opciones.sites, estados: opciones.estados });

  // Selección de personas por registrar, por literal: es lo que las
  // identifica entre recargas. Lo que ya no está en la lista (se registró o
  // se ignoró) se descarta al leerla, sin esperar a que nadie la limpie.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  // El equipo donde se registra y, en bloque, con qué rol. `null` es "el sugerido":
  // el que comparten las elegidas, si lo comparten.
  const [equipoSlug, setEquipoSlug] = useState<string>(opciones.equipos[0]?.slug ?? '');
  const [rolLote, setRolLote] = useState<RolVentas | null>(null);
  const equipoElegido = opciones.equipos.find((e) => e.slug === equipoSlug);
  // El rol de un pendiente en el equipo elegido: el sugerido si el equipo lo tiene; si no, el de quien vende.
  const rolEnEquipo = (sugerido: RolVentas): RolVentas | null => {
    const roles = equipoElegido?.roles ?? [];
    if (roles.some((r) => r.rol === sugerido)) return sugerido;
    return (roles.find((r) => r.rol === 'asesor') ?? roles.find((r) => r.rol === 'telemarketing') ?? roles[0])?.rol ?? null;
  };
  // En bloque solo los roles que no piden más que el nombre y el medio.
  const rolesEnBloque = (equipoElegido?.roles ?? []).filter((r) => r.medio && !r.site && !r.unidades && !r.usuario);
  const seleccionVigente = useMemo(() => {
    const presentes = new Set((pendientes.ventas ?? []).map((p) => p.nombre));
    return new Set([...seleccion].filter((nombre) => presentes.has(nombre)));
  }, [seleccion, pendientes.ventas]);
  const rolSugeridoLote = useMemo(() => {
    const roles = new Set((pendientes.ventas ?? [])
      .filter((p) => seleccionVigente.has(p.nombre))
      .map((p) => p.rol));
    return roles.size === 1 ? [...roles][0] : null;
  }, [seleccionVigente, pendientes.ventas]);
  const rolElegido = rolLote ?? (rolSugeridoLote && rolesEnBloque.some((r) => r.rol === rolSugeridoLote) ? rolSugeridoLote : null);
  const cambiarSeleccion = (siguiente: Set<string>) => {
    setSeleccion(siguiente);
    if (siguiente.size === 0) setRolLote(null);
  };
  // El nombre pendiente que se está vinculando a alguien ya registrado, y a quién.
  const [vinculando, setVinculando] = useState<PersonaPendiente | null>(null);
  const [vincularA, setVincularA] = useState('');
  const vincular = async () => {
    const persona = opciones.personas.find((p) => String(p.id) === vincularA);
    if (!persona || !vinculando) return;
    const columnas = (Object.keys(ALIAS_DE_COLUMNA) as ColumnaVentas[])
      .filter((col) => vinculando.ordenes[col])
      .map((col) => ALIAS_DE_COLUMNA[col]);
    if (await c.vincularNombre(persona, vinculando.nombre, columnas)) setVinculando(null);
  };

  const registrarSeleccion = async () => {
    if (!rolElegido || !equipoElegido || seleccionVigente.size === 0) return;
    const registradas = await c.registrarPersonas([...seleccionVigente], rolElegido, equipoElegido.id, equipoElegido.slug);
    if (registradas > 0) cambiarSeleccion(new Set());
  };
  const registrar = (area: keyof typeof LISTAS, nombre: string) =>
    (area === 'productos' ? c.crearPlanDesde(nombre) : c.crearZonaDesde(nombre));

  const listas = (Object.keys(LISTAS) as (keyof typeof LISTAS)[])
    .flatMap((area) => {
      const filas = pendientes[area];
      return filas ? [{ area, filas, ...LISTAS[area] }] : [];
    });
  const totalPendientes = listas.reduce((total, lista) => total + lista.filas.length, 0)
    + (pendientes.ventas?.length ?? 0);
  const etiquetaArea = (area: AreaCatalogo) => areas.find((a) => a.value === area)?.label ?? area;

  const columnasPendientes = (
    area: keyof typeof LISTAS,
    columna: string,
    etiqueta: string,
  ): Column<ProductoPendiente>[] => [
    { header: columna, accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Órdenes', accessor: 'ordenes', align: 'right', sortKey: 'ordenes' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => registrar(area, row.nombre)}
          >
            {etiqueta}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<EyeOff className="h-4 w-4" />}
            onClick={() => c.ignorar(area, row.nombre)}
          >
            Ignorar
          </Button>
        </div>
      ),
    },
  ];

  const columnasVentas: Column<PersonaPendiente>[] = [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    {
      header: 'Aparece como',
      // Una cuenta por columna y no un total: la venta directa de un
      // supervisor está a la vez en «Medio» y en «Supervisor».
      accessor: (row) => (Object.keys(COLUMNA_VENTAS) as ColumnaVentas[])
        .filter((col) => row.ordenes[col])
        .map((col) => `${COLUMNA_VENTAS[col]}: ${row.ordenes[col]}`)
        .join(' · '),
    },
    {
      header: 'Rol sugerido',
      accessor: (row) => rolSugerido(row.rol),
      filterable: true,
      filterValue: (row) => rolSugerido(row.rol),
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            disabled={!equipoElegido}
            onClick={() => {
              const rol = rolEnEquipo(row.rol);
              if (equipoElegido && rol) c.crearPersonaDesde(row.nombre, rol, equipoElegido.id, equipoElegido.slug);
            }}
          >
            Registrar
          </Button>
          {opciones.personas.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Link2 className="h-4 w-4" />}
              onClick={() => {
                setVinculando(row);
                setVincularA('');
              }}
              title="Es alguien ya registrado, que Odoo escribe de otra forma (con otra tilde, por ejemplo)"
            >
              Vincular
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            icon={<EyeOff className="h-4 w-4" />}
            onClick={() => c.ignorar('ventas', row.nombre)}
          >
            Ignorar
          </Button>
        </div>
      ),
    },
  ];

  const columnasIgnorados: Column<CatalogoProductoIgnorado>[] = [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    {
      header: 'Lista',
      accessor: (row) => etiquetaArea(row.area),
      sortKey: 'area',
      filterable: true,
      filterValue: (row) => etiquetaArea(row.area),
    },
    { header: 'Nota', accessor: (row) => row.nota || '—' },
    {
      header: 'Registrado por',
      accessor: (row) => row.creado_por || '—',
      filterable: true,
      filterValue: (row) => row.creado_por || 'Sin registrar',
    },
    { header: 'Fecha', accessor: 'creado_en', sortKey: 'creado_en' },
    columnaAcciones<CatalogoProductoIgnorado>(c.editarIgnorado, (row) =>
      c.setBorrando({ tipo: 'ignorados', id: row.id, nombre: row.nombre })),
  ];

  const primeraArea = (areas[0]?.value ?? 'productos') as AreaCatalogo;
  const alta = c.vista === 'ignorados' && areas.length > 0
    ? { label: 'Ignorar un nombre', onClick: () => c.nuevoIgnorado(primeraArea) }
    : undefined;

  return (
    <AppLayout
      toolbar={
        <BarraCatalogo
          activa={c.vista}
          onChange={(key) => c.setVista(key as typeof c.vista)}
          alta={alta}
          pestanas={[
            { key: 'pendientes', label: `Por registrar (${totalPendientes})`, icon: AlertTriangle },
            { key: 'ignorados', label: `Ignorados (${ignorados.length})`, icon: EyeOff },
          ]}
        />
      }
    >
      <ErrorCatalogo c={c} conAviso />

      {c.vista === 'pendientes' && (
        <div className="space-y-6">
          {listas.map((lista) => (
            <NeonContainer
              key={lista.area}
              title={`${lista.titulo} (${lista.filas.length})`}
              subtitle={lista.subtitulo}
              icon={lista.icon}
              theme={lista.filas.length ? 'yellow' : 'slate'}
              noPadding
            >
              {lista.filas.length === 0 ? (
                <EmptyState title="Nada pendiente" description={lista.vacia} icon={<ShieldAlert />} />
              ) : (
                <DataTable
                  columns={columnasPendientes(lista.area, lista.columna, lista.registrar)}
                  data={lista.filas}
                  searchable
                  searchPlaceholder={`Buscar ${lista.columna.toLowerCase()}...`}
                  scrollClassName={SCROLL_TABLA}
                />
              )}
            </NeonContainer>
          ))}
          {pendientes.ventas && (
            <NeonContainer
              title={`Personas de ventas por registrar (${pendientes.ventas.length})`}
              subtitle="Aparecen como Vendedor, Medio o Supervisor en las suscripciones y no están en el directorio: Comisiones no tiene a quién pagarles"
              icon={<Briefcase className="h-5 w-5" />}
              theme={pendientes.ventas.length ? 'yellow' : 'slate'}
              noPadding
            >
              {pendientes.ventas.length === 0 ? (
                <EmptyState
                  title="Nada pendiente"
                  description="Todos los nombres de ventas de las suscripciones están en el directorio (o el export todavía no trae «Medio»)."
                  icon={<ShieldAlert />}
                />
              ) : (
                <>
                  <BarraLote
                    seleccionadas={seleccionVigente.size}
                    equipo={equipoSlug}
                    equipos={opciones.equipos.map((e) => ({ value: e.slug, label: e.nombre }))}
                    onEquipo={(slug) => { setEquipoSlug(slug); setRolLote(null); }}
                    rol={rolElegido}
                    roles={rolesEnBloque.map((r) => ({ value: r.rol, label: r.etiqueta }))}
                    guardando={c.guardando}
                    onRol={(valor) => setRolLote(valor as RolVentas)}
                    onRegistrar={registrarSeleccion}
                    onLimpiar={() => cambiarSeleccion(new Set())}
                  />
                  <DataTable
                    columns={columnasVentas}
                    data={pendientes.ventas}
                    searchable
                    searchPlaceholder="Buscar nombre..."
                    scrollClassName={SCROLL_TABLA}
                    selection={{ rowKey: (row) => row.nombre, selected: seleccionVigente, onChange: cambiarSeleccion, conservar: true }}
                  />
                </>
              )}
            </NeonContainer>
          )}
          {listas.length === 0 && !pendientes.ventas && (
            <EmptyState
              title="Ninguna lista de pendientes"
              description="Las listas de pendientes son de Productos, Estructura y Ventas, y no administras ninguno de los tres."
              icon={<ShieldAlert />}
            />
          )}
        </div>
      )}

      {c.vista === 'ignorados' && (
        <NeonContainer
          title="Nombres ignorados"
          subtitle="Lo que se decidió no registrar. Borrar uno lo devuelve a su lista de pendientes"
          icon={<EyeOff className="h-5 w-5" />}
          theme="slate"
          noPadding
        >
          <DataTable
            columns={columnasIgnorados}
            data={ignorados}
            searchable
            searchPlaceholder="Buscar nombre..."
            scrollClassName={SCROLL_TABLA}
          />
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.ignoradoDraft)}
        onClose={c.cerrarFormularios}
        title="Nombre ignorado"
        subtitle="Un nombre de los datos que no se registrará y no debe aparecer como pendiente"
        icon={<EyeOff className="h-5 w-5 text-slate-300" />}
        theme="slate"
        size="md"
      >
        {c.ignoradoDraft && (
          <IgnoradoForm
            value={c.ignoradoDraft}
            areas={areas}
            saving={c.guardando}
            onChange={(patch) => c.setIgnoradoDraft({ ...c.ignoradoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('ignorados', { ...c.ignoradoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.planDraft)}
        onClose={c.cerrarFormularios}
        title="Nuevo plan del catálogo"
        subtitle="Única clasificación del producto: de aquí la leen los análisis y el reporte ETA"
        icon={<BookMarked className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.planDraft && (
          <PlanForm
            value={c.planDraft}
            tecnologias={opciones.tecnologias}
            tiposPersona={opciones.tiposPersona}
            reguladores={opciones.reguladores}
            saving={c.guardando}
            onChange={(patch) => c.setPlanDraft({ ...c.planDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('planes', { ...c.planDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.zonaDraft)}
        onClose={c.cerrarFormularios}
        title="Nueva zona"
        subtitle="Nodo de red: site, estado y coordinador por los que se agrupa"
        icon={<Network className="h-5 w-5 text-sky-400" />}
        theme="blue"
      >
        {c.zonaDraft && (
          <ZonaForm
            value={c.zonaDraft}
            sites={opciones.sites}
            estados={opciones.estados}
            coordinadores={opciones.coordinadores}
            tecnologias={opciones.tecnologias}
            saving={c.guardando}
            onChange={(patch) => c.setZonaDraft({ ...c.zonaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('zonas', { ...c.zonaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.personaDraft)}
        onClose={c.cerrarFormularios}
        title="Registrar persona de ventas"
        subtitle="Cómo aparece en las suscripciones: es contra esto que Comisiones reparte cada venta"
        icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.personaDraft && (() => {
          const equipo = opciones.equipos.find((e) => e.slug === c.personaDraft!.equipo);
          const rol = equipo?.roles.find((r) => r.rol === c.personaDraft!.rol);
          return equipo && rol ? (
            <MembresiaForm
              value={c.personaDraft}
              equipos={opciones.equipos}
              equipo={equipo}
              rol={rol}
              personas={opciones.personas}
              membresias={opciones.membresias}
              sites={opciones.sites}
              unidades={opciones.coordinadores}
              saving={c.guardando}
              onChange={(patch) => c.setPersonaDraft({ ...c.personaDraft!, ...patch })}
              onSubmit={(e) => enviar(e, () => c.guardar('membresias', { ...c.personaDraft }))}
              onClose={c.cerrarFormularios}
            />
          ) : null;
        })()}
      </Modal>

      <Modal
        isOpen={vinculando !== null}
        onClose={() => setVinculando(null)}
        title="Vincular a una persona registrada"
        subtitle="La misma persona, escrita de otra forma en las suscripciones"
        icon={<Link2 className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {vinculando !== null && (
          <div className="space-y-5">
            <p className="text-sm text-slate-300">
              Las ventas con <strong className="text-white">«{vinculando.nombre}»</strong> como{' '}
              {(Object.keys(ALIAS_DE_COLUMNA) as ColumnaVentas[])
                .filter((col) => vinculando.ordenes[col])
                .map((col) => COLUMNA_VENTAS[col].toLowerCase())
                .join(' y ')}{' '}
              serán de:
            </p>
            <SelectMenu
              aria-label="Persona registrada"
              className="w-full rounded-xl border border-slate-700/50 bg-surface-primary px-3 py-2.5 text-sm text-white"
              searchable
              value={vincularA}
              placeholder="Elige a la persona"
              options={opciones.personas.map((p) => ({
                value: String(p.id),
                label: `${p.nombre} ${p.apellido} · ${p.membresias.map((m) => m.etiqueta).join(', ')}`,
              }))}
              onChange={setVincularA}
            />
            <p className="text-[11px] text-slate-500">
              Se añade como otro nombre suyo en esa columna: sus nombres principales no cambian y sus ventas se suman.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setVinculando(null)}>
                Cancelar
              </Button>
              <Button icon={<Link2 className="h-4 w-4" />} disabled={!vincularA} isLoading={c.guardando} onClick={() => void vincular()}>
                Vincular
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmarBorrado c={c} />
    </AppLayout>
  );
}

interface BarraLoteProps {
  seleccionadas: number;
  /** El equipo donde se registra. */
  equipo: string;
  equipos: { value: string; label: string }[];
  onEquipo: (slug: string) => void;
  /** `null` cuando las elegidas no comparten rol sugerido y nadie eligió uno. */
  rol: RolVentas | null;
  roles: { value: string; label: string }[];
  guardando: boolean;
  onRol: (valor: string) => void;
  onRegistrar: () => void;
  onLimpiar: () => void;
}

/**
 * El registro en bloque de las personas por registrar: se filtra por rol
 * sugerido, se marcan las casillas (la de la cabecera toma todas las
 * filtradas, no solo las de la página) y se registran de una vez en el equipo
 * y con el rol elegidos. Los roles que piden más que el nombre (site, unidades,
 * usuario de Odoo) se registran de uno en uno. Sin selección, solo explica cómo
 * se usa; el equipo se elige siempre, también para «Registrar» una a una.
 */
function BarraLote({
  seleccionadas, equipo, equipos, onEquipo, rol, roles, guardando, onRol, onRegistrar, onLimpiar,
}: BarraLoteProps) {
  const selectorEquipo = (
    <>
      <span className="text-xs text-slate-400">Registrar en el equipo</span>
      <SelectMenu
        aria-label="Equipo donde se registran"
        className="min-w-[160px] rounded-xl border border-slate-700/50 bg-surface-secondary px-3 py-1.5 text-xs text-white"
        value={equipo}
        options={equipos}
        onChange={onEquipo}
      />
    </>
  );
  if (seleccionadas === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-surface-secondary/50 px-4 py-2">
        {selectorEquipo}
        <p className="text-[11px] text-slate-500">
          Para registrar varias a la vez, marca las casillas: la de la cabecera selecciona todas las filtradas.
          Lo marcado se conserva al buscar o filtrar, así que puedes ir juntando personas de varias búsquedas.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
        {seleccionadas} seleccionada{seleccionadas === 1 ? '' : 's'}
      </span>
      <span className="text-[11px] text-emerald-300/70">se conservan al buscar o filtrar</span>
      {selectorEquipo}
      <span className="text-xs text-slate-400">como</span>
      <SelectMenu
        aria-label="Rol con el que se registran"
        className="min-w-[180px] rounded-xl border border-slate-700/50 bg-surface-secondary px-3 py-1.5 text-xs text-white"
        value={rol ?? ''}
        placeholder="Elige un rol"
        options={roles}
        onChange={onRol}
      />
      <Button
        size="sm"
        icon={<UserPlus className="h-4 w-4" />}
        disabled={!rol}
        isLoading={guardando}
        onClick={onRegistrar}
      >
        Registrar {seleccionadas}
      </Button>
      <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={onLimpiar}>
        Limpiar
      </Button>
    </div>
  );
}
