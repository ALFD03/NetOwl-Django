/** Catálogos › Notificaciones: lo pendiente de cada área y lo que se decidió ignorar. */

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, BookMarked, Briefcase, EyeOff, Link2, Network, Plus, ShieldAlert, UserPlus, X } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, EmptyState, Modal, NeonContainer, SelectMenu, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  AreaCatalogo,
  CargoVentas,
  CatalogoProductoIgnorado,
  CatalogosNotificacionesProps,
  ColumnaVentas,
  PersonaPendiente,
  ProductoPendiente,
} from '@/features/subscriptions/types';
import { IgnoradoForm, PlanForm, ZonaForm } from './CatalogoForms';
import { PersonaForm } from './VentasForms';
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

/** Los cargos tal y como se sugieren al registrar. */
const CARGO_SUGERIDO: Record<PersonaPendiente['cargo'], string> = {
  asesor: 'Asesor',
  supervisor: 'Supervisor',
  coord_oficina: 'Coord. de oficina',
  coord_un: 'Coord. de UN',
};

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
  // `null` es "el sugerido": el que comparten las elegidas, si lo comparten.
  const [cargoLote, setCargoLote] = useState<CargoVentas | null>(null);
  const seleccionVigente = useMemo(() => {
    const presentes = new Set((pendientes.ventas ?? []).map((p) => p.nombre));
    return new Set([...seleccion].filter((nombre) => presentes.has(nombre)));
  }, [seleccion, pendientes.ventas]);
  const cargoSugerido = useMemo(() => {
    const cargos = new Set((pendientes.ventas ?? [])
      .filter((p) => seleccionVigente.has(p.nombre))
      .map((p) => p.cargo));
    return cargos.size === 1 ? [...cargos][0] : null;
  }, [seleccionVigente, pendientes.ventas]);
  const cargoElegido = cargoLote ?? cargoSugerido;
  const cambiarSeleccion = (siguiente: Set<string>) => {
    setSeleccion(siguiente);
    if (siguiente.size === 0) setCargoLote(null);
  };
  // El nombre de «Oportunidad/Administrador» que se está vinculando a alguien ya
  // registrado, y a quién.
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [vincularA, setVincularA] = useState('');
  const vincular = async () => {
    const persona = opciones.supervisores.find((p) => String(p.id) === vincularA);
    if (!persona || !vinculando) return;
    if (await c.vincularSupervisor(persona, vinculando)) setVinculando(null);
  };

  const registrarSeleccion = async () => {
    if (!cargoElegido || seleccionVigente.size === 0) return;
    const registradas = await c.registrarPersonas([...seleccionVigente], cargoElegido);
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
      header: 'Cargo sugerido',
      accessor: (row) => CARGO_SUGERIDO[row.cargo],
      filterable: true,
      filterValue: (row) => CARGO_SUGERIDO[row.cargo],
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => c.crearPersonaDesde(row.nombre, row.cargo)}
          >
            Registrar
          </Button>
          {Boolean(row.ordenes.medio_supervisor) && opciones.supervisores.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Link2 className="h-4 w-4" />}
              onClick={() => {
                setVinculando(row.nombre);
                setVincularA('');
              }}
              title="Es alguien ya registrado, que Odoo escribe distinto como supervisor"
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
                    cargo={cargoElegido}
                    cargos={opciones.cargos}
                    guardando={c.guardando}
                    onCargo={(valor) => setCargoLote(valor as CargoVentas)}
                    onRegistrar={registrarSeleccion}
                    onLimpiar={() => cambiarSeleccion(new Set())}
                  />
                  <DataTable
                    columns={columnasVentas}
                    data={pendientes.ventas}
                    searchable
                    searchPlaceholder="Buscar nombre..."
                    scrollClassName={SCROLL_TABLA}
                    selection={{ rowKey: (row) => row.nombre, selected: seleccionVigente, onChange: cambiarSeleccion }}
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
        {c.personaDraft && (
          <PersonaForm
            value={c.personaDraft}
            cargos={opciones.cargos}
            saving={c.guardando}
            onChange={(patch) => c.setPersonaDraft({ ...c.personaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('personas', { ...c.personaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={vinculando !== null}
        onClose={() => setVinculando(null)}
        title="Vincular nombre de supervisor"
        subtitle="La misma persona, escrita distinto en «Oportunidad/Administrador»"
        icon={<Link2 className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {vinculando !== null && (
          <div className="space-y-5">
            <p className="text-sm text-slate-300">
              Las ventas con <strong className="text-white">«{vinculando}»</strong> como supervisor serán de:
            </p>
            <SelectMenu
              aria-label="Persona registrada"
              className="w-full rounded-xl border border-slate-700/50 bg-surface-primary px-3 py-2.5 text-sm text-white"
              searchable
              value={vincularA}
              placeholder="Elige a la persona"
              options={opciones.supervisores.map((p) => ({
                value: String(p.id),
                label: `${p.nombre} ${p.apellido} · ${CARGO_SUGERIDO[p.cargo]}${p.medio_supervisor ? ` · ya es «${p.medio_supervisor}»` : ''}`,
              }))}
              onChange={setVincularA}
            />
            <p className="text-[11px] text-slate-500">
              Se guarda como su nombre «como supervisor»: su medio no cambia. Si ya tenía otro, se sustituye.
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
  /** `null` cuando las elegidas no comparten cargo sugerido y nadie eligió uno. */
  cargo: CargoVentas | null;
  cargos: { value: string; label: string }[];
  guardando: boolean;
  onCargo: (valor: string) => void;
  onRegistrar: () => void;
  onLimpiar: () => void;
}

/**
 * El registro en bloque de las personas por registrar: se filtra por cargo
 * sugerido, se marcan las casillas (la de la cabecera toma todas las
 * filtradas, no solo las de la página) y se registran de una vez con el cargo
 * elegido. Sin selección, solo explica cómo se usa.
 */
function BarraLote({ seleccionadas, cargo, cargos, guardando, onCargo, onRegistrar, onLimpiar }: BarraLoteProps) {
  if (seleccionadas === 0) {
    return (
      <p className="border-b border-slate-800 bg-surface-secondary/50 px-4 py-2 text-[11px] text-slate-500">
        Para registrar varias a la vez, filtra por cargo sugerido y marca las casillas: la de la cabecera
        selecciona todas las filtradas.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
        {seleccionadas} seleccionada{seleccionadas === 1 ? '' : 's'}
      </span>
      <span className="text-xs text-slate-400">Registrar como</span>
      <SelectMenu
        aria-label="Cargo con el que se registran"
        className="min-w-[180px] rounded-xl border border-slate-700/50 bg-surface-secondary px-3 py-1.5 text-xs text-white"
        value={cargo ?? ''}
        placeholder="Elige un cargo"
        options={cargos}
        onChange={onCargo}
      />
      <Button
        size="sm"
        icon={<UserPlus className="h-4 w-4" />}
        disabled={!cargo}
        isLoading={guardando}
        onClick={onRegistrar}
      >
        Registrar {seleccionadas}
      </Button>
      <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={onLimpiar}>
        Quitar selección
      </Button>
      <span className="basis-full text-[11px] text-slate-500">
        El nombre y el apellido se deducen del literal; corrígelos después en Catálogos › Ventas si hace falta.
      </span>
    </div>
  );
}
