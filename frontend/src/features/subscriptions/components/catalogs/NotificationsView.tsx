/** Catálogos › Notificaciones: lo pendiente de cada área y lo que se decidió ignorar. */

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, BookMarked, Briefcase, EyeOff, Link2, Network, Plus, ShieldAlert } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, EmptyState, Modal, NeonContainer, SelectMenu, type Column } from '@/shared/ui';
import { useCatalogs } from '@/features/subscriptions/hooks/useCatalogs';
import type {
  CatalogArea,
  CatalogIgnoredProduct,
  CatalogsNotificationsProps,
  SalesColumn,
  PendingPerson,
  PendingProduct,
  SalesRole,
} from '@/features/subscriptions/types';
import { ROLE_UI } from './SalesForms';
import { CatalogBar, ConfirmDelete, CatalogErrorView, actionsColumn } from './CatalogCommon';
import { NotificationFormModals } from './NotificationFormModals';
import { BatchBar } from './PendingSalesBatchBar';

/**
 * Altura del área que hace scroll en cada tabla. Con el scroll dentro de la
 * tabla y no en la página, los filtros, el buscador y la cabecera quedan
 * siempre a la vista mientras se recorren las filas.
 */
const TABLE_SCROLL = 'max-h-[60vh]';

/** Cómo se presenta la lista de pendientes de cada área. */
const LISTS: Record<Exclude<CatalogArea, 'ventas'>, {
  title: string;
  subtitle: string;
  column: string;
  icon: ReactNode;
  empty: string;
  /** El botón que abre el alta, con el nombre ya escrito en el formulario. */
  register: string;
}> = {
  productos: {
    title: 'Productos por registrar',
    subtitle: 'Están en los datos importados y ningún plan del catálogo los reconoce. Bloquean importaciones y análisis',
    column: 'Producto',
    icon: <BookMarked className="h-5 w-5" />,
    empty: 'Todo lo importado está catalogado: las importaciones y los análisis no tienen nada que reclamar.',
    register: 'Crear plan',
  },
  estructura: {
    title: 'Zonas por registrar',
    subtitle: 'Las traen las suscripciones y no están en el catálogo: sus órdenes quedan sin site, estado ni coordinador',
    column: 'Zona',
    icon: <Network className="h-5 w-5" />,
    empty: 'Todas las zonas de las suscripciones están en el catálogo.',
    register: 'Crear zona',
  },
};

/** Cómo se llama en pantalla cada columna del export que nombra a alguien de ventas. */
const SALES_COLUMN: Record<SalesColumn, string> = {
  seller: 'Vendedor',
  supervisor_channel: 'Supervisor',
  channel: 'Medio',
};

/** Dónde se guarda como otro nombre de la persona lo que aparece en cada columna del export. */
const COLUMN_ALIASES = {
  channel: 'channel_alias',
  supervisor_channel: 'supervisor_alias',
  seller: 'user_alias',
} as const;

/** El rol tal y como se sugiere al registrar. */
const suggestedRole = (role: PendingPerson['role']) => ROLE_UI[role].short;

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
export function NotificationsView({ pending, ignored, areas, options }: CatalogsNotificationsProps) {
  const c = useCatalogs({ initialView: 'pendientes', sites: options.sites, states: options.states });

  // Selección de personas por registrar, por literal: es lo que las
  // identifica entre recargas. Lo que ya no está en la lista (se registró o
  // se ignoró) se descarta al leerla, sin esperar a que nadie la limpie.
  const [selection, setSelection] = useState<Set<string>>(new Set());
  // El equipo donde se registra y, en bloque, con qué rol. `null` es "el sugerido":
  // el que comparten las elegidas, si lo comparten.
  const [teamSlug, setTeamSlug] = useState<string>(options.teams[0]?.slug ?? '');
  const [batchRole, setBatchRole] = useState<SalesRole | null>(null);
  const selectedTeam = options.teams.find((e) => e.slug === teamSlug);
  // El rol de un pendiente en el equipo elegido: el sugerido si el equipo lo tiene; si no, el de quien vende.
  const roleInTeam = (suggested: SalesRole): SalesRole | null => {
    const roles = selectedTeam?.roles ?? [];
    if (roles.some((r) => r.role === suggested)) return suggested;
    return (roles.find((r) => r.role === 'asesor') ?? roles.find((r) => r.role === 'telemarketing') ?? roles[0])?.role ?? null;
  };
  // En bloque solo los roles que no piden más que el nombre y el medio.
  const rolesInBlock = (selectedTeam?.roles ?? []).filter((r) => r.channel && !r.site && !r.units && !r.user);
  const currentSelection = useMemo(() => {
    const present = new Set((pending.ventas ?? []).map((p) => p.name));
    return new Set([...selection].filter((name) => present.has(name)));
  }, [selection, pending.ventas]);
  const suggestedBatchRole = useMemo(() => {
    const roles = new Set((pending.ventas ?? [])
      .filter((p) => currentSelection.has(p.name))
      .map((p) => p.role));
    return roles.size === 1 ? [...roles][0] : null;
  }, [currentSelection, pending.ventas]);
  const chosenRole = batchRole ?? (suggestedBatchRole && rolesInBlock.some((r) => r.role === suggestedBatchRole) ? suggestedBatchRole : null);
  const changeSelection = (next: Set<string>) => {
    setSelection(next);
    if (next.size === 0) setBatchRole(null);
  };
  // El nombre pendiente que se está vinculando a alguien ya registrado, y a quién.
  const [linking, setLinking] = useState<PendingPerson | null>(null);
  const [linkTo, setLinkTo] = useState('');
  const link = async () => {
    const person = options.people.find((p) => String(p.id) === linkTo);
    if (!person || !linking) return;
    const columns = (Object.keys(COLUMN_ALIASES) as SalesColumn[])
      .filter((col) => linking.orders[col])
      .map((col) => COLUMN_ALIASES[col]);
    if (await c.linkName(person, linking.name, columns)) setLinking(null);
  };

  const registerSelection = async () => {
    if (!chosenRole || !selectedTeam || currentSelection.size === 0) return;
    const registered = await c.registerPeople([...currentSelection], chosenRole, selectedTeam.id, selectedTeam.slug);
    if (registered > 0) changeSelection(new Set());
  };
  const register = (area: keyof typeof LISTS, name: string) =>
    (area === 'productos' ? c.createPlanFrom(name) : c.createZoneFrom(name));

  const lists = (Object.keys(LISTS) as (keyof typeof LISTS)[])
    .flatMap((area) => {
      const rows = pending[area];
      return rows ? [{ area, rows, ...LISTS[area] }] : [];
    });
  const pendingTotal = lists.reduce((total, list) => total + list.rows.length, 0)
    + (pending.ventas?.length ?? 0);
  const areaLabel = (area: CatalogArea) => areas.find((a) => a.value === area)?.label ?? area;

  const pendingColumns = (
    area: keyof typeof LISTS,
    column: string,
    label: string,
  ): Column<PendingProduct>[] => [
    { header: column, accessor: 'name', sortKey: 'name' },
    { header: 'Órdenes', accessor: 'orders', align: 'right', sortKey: 'orders' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => register(area, row.name)}
          >
            {label}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<EyeOff className="h-4 w-4" />}
            onClick={() => c.ignore(area, row.name)}
          >
            Ignorar
          </Button>
        </div>
      ),
    },
  ];

  const salesColumns: Column<PendingPerson>[] = [
    { header: 'Nombre', accessor: 'name', sortKey: 'name' },
    {
      header: 'Aparece como',
      // Una cuenta por columna y no un total: la venta directa de un
      // supervisor está a la vez en «Medio» y en «Supervisor».
      accessor: (row) => (Object.keys(SALES_COLUMN) as SalesColumn[])
        .filter((col) => row.orders[col])
        .map((col) => `${SALES_COLUMN[col]}: ${row.orders[col]}`)
        .join(' · '),
    },
    {
      header: 'Rol sugerido',
      accessor: (row) => suggestedRole(row.role),
      filterable: true,
      filterValue: (row) => suggestedRole(row.role),
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            disabled={!selectedTeam}
            onClick={() => {
              const role = roleInTeam(row.role);
              if (selectedTeam && role) c.createPersonFrom(row.name, role, selectedTeam.id, selectedTeam.slug);
            }}
          >
            Registrar
          </Button>
          {options.people.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Link2 className="h-4 w-4" />}
              onClick={() => {
                setLinking(row);
                setLinkTo('');
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
            onClick={() => c.ignore('ventas', row.name)}
          >
            Ignorar
          </Button>
        </div>
      ),
    },
  ];

  const ignoredColumns: Column<CatalogIgnoredProduct>[] = [
    { header: 'Nombre', accessor: 'name', sortKey: 'name' },
    {
      header: 'Lista',
      accessor: (row) => areaLabel(row.area),
      sortKey: 'area',
      filterable: true,
      filterValue: (row) => areaLabel(row.area),
    },
    { header: 'Nota', accessor: (row) => row.note || '—' },
    {
      header: 'Registrado por',
      accessor: (row) => row.created_by || '—',
      filterable: true,
      filterValue: (row) => row.created_by || 'Sin registrar',
    },
    { header: 'Fecha', accessor: 'created_at', sortKey: 'created_at' },
    actionsColumn<CatalogIgnoredProduct>(c.editIgnored, (row) =>
      c.setDeleting({ kind: 'ignorados', id: row.id, name: row.name })),
  ];

  const firstArea = (areas[0]?.value ?? 'productos') as CatalogArea;
  const create = c.view === 'ignorados' && areas.length > 0
    ? { label: 'Ignorar un nombre', onClick: () => c.newIgnored(firstArea) }
    : undefined;

  return (
    <AppLayout
      toolbar={
        <CatalogBar
          active={c.view}
          onChange={(key) => c.setView(key as typeof c.view)}
          create={create}
          tabs={[
            { key: 'pendientes', label: `Por registrar (${pendingTotal})`, icon: AlertTriangle },
            { key: 'ignorados', label: `Ignorados (${ignored.length})`, icon: EyeOff },
          ]}
        />
      }
    >
      <CatalogErrorView c={c} withNotice />

      {c.view === 'pendientes' && (
        <div className="space-y-6">
          {lists.map((list) => (
            <NeonContainer
              key={list.area}
              title={`${list.title} (${list.rows.length})`}
              subtitle={list.subtitle}
              icon={list.icon}
              theme={list.rows.length ? 'yellow' : 'slate'}
              noPadding
            >
              {list.rows.length === 0 ? (
                <EmptyState title="Nada pendiente" description={list.empty} icon={<ShieldAlert />} />
              ) : (
                <DataTable
                  columns={pendingColumns(list.area, list.column, list.register)}
                  data={list.rows}
                  searchable
                  searchPlaceholder={`Buscar ${list.column.toLowerCase()}...`}
                  scrollClassName={TABLE_SCROLL}
                />
              )}
            </NeonContainer>
          ))}
          {pending.ventas && (
            <NeonContainer
              title={`Personas de ventas por registrar (${pending.ventas.length})`}
              subtitle="Aparecen como Vendedor, Medio o Supervisor en las suscripciones y no están en el directorio: Comisiones no tiene a quién pagarles"
              icon={<Briefcase className="h-5 w-5" />}
              theme={pending.ventas.length ? 'yellow' : 'slate'}
              noPadding
            >
              {pending.ventas.length === 0 ? (
                <EmptyState
                  title="Nada pendiente"
                  description="Todos los nombres de ventas de las suscripciones están en el directorio (o el export todavía no trae «Medio»)."
                  icon={<ShieldAlert />}
                />
              ) : (
                <>
                  <BatchBar
                    selectedNames={currentSelection.size}
                    team={teamSlug}
                    teams={options.teams.map((e) => ({ value: e.slug, label: e.name }))}
                    onTeam={(slug) => { setTeamSlug(slug); setBatchRole(null); }}
                    role={chosenRole}
                    roles={rolesInBlock.map((r) => ({ value: r.role, label: r.role_label }))}
                    saving={c.saving}
                    onRole={(value) => setBatchRole(value as SalesRole)}
                    onRegister={registerSelection}
                    onClear={() => changeSelection(new Set())}
                  />
                  <DataTable
                    columns={salesColumns}
                    data={pending.ventas}
                    searchable
                    searchPlaceholder="Buscar nombre..."
                    scrollClassName={TABLE_SCROLL}
                    selection={{ rowKey: (row) => row.name, selected: currentSelection, onChange: changeSelection, keep: true }}
                  />
                </>
              )}
            </NeonContainer>
          )}
          {lists.length === 0 && !pending.ventas && (
            <EmptyState
              title="Ninguna lista de pendientes"
              description="Las listas de pendientes son de Productos, Estructura y Ventas, y no administras ninguno de los tres."
              icon={<ShieldAlert />}
            />
          )}
        </div>
      )}

      {c.view === 'ignorados' && (
        <NeonContainer
          title="Nombres ignorados"
          subtitle="Lo que se decidió no registrar. Borrar uno lo devuelve a su lista de pendientes"
          icon={<EyeOff className="h-5 w-5" />}
          theme="slate"
          noPadding
        >
          <DataTable
            columns={ignoredColumns}
            data={ignored}
            searchable
            searchPlaceholder="Buscar nombre..."
            scrollClassName={TABLE_SCROLL}
          />
        </NeonContainer>
      )}

      <NotificationFormModals c={c} areas={areas} options={options} />

      <Modal
        isOpen={linking !== null}
        onClose={() => setLinking(null)}
        title="Vincular a una persona registrada"
        subtitle="La misma persona, escrita de otra forma en las suscripciones"
        icon={<Link2 className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {linking !== null && (
          <div className="space-y-5">
            <p className="text-sm text-slate-300">
              Las ventas con <strong className="text-white">«{linking.name}»</strong> como{' '}
              {(Object.keys(COLUMN_ALIASES) as SalesColumn[])
                .filter((col) => linking.orders[col])
                .map((col) => SALES_COLUMN[col].toLowerCase())
                .join(' y ')}{' '}
              serán de:
            </p>
            <SelectMenu
              aria-label="Persona registrada"
              className="w-full rounded-xl border border-slate-700/50 bg-surface-primary px-3 py-2.5 text-sm text-white"
              searchable
              value={linkTo}
              placeholder="Elige a la persona"
              options={options.people.map((p) => ({
                value: String(p.id),
                label: `${p.name} ${p.last_name} · ${p.memberships.map((m) => m.role_label).join(', ')}`,
              }))}
              onChange={setLinkTo}
            />
            <p className="text-[11px] text-slate-500">
              Se añade como otro nombre suyo en esa columna: sus nombres principales no cambian y sus ventas se suman.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setLinking(null)}>
                Cancelar
              </Button>
              <Button icon={<Link2 className="h-4 w-4" />} disabled={!linkTo} isLoading={c.saving} onClick={() => void link()}>
                Vincular
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDelete c={c} />
    </AppLayout>
  );
}
