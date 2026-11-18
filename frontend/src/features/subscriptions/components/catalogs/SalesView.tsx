/** Catálogos › Ventas: la estructura de ventas, los equipos con su gente y sus condiciones, y los objetivos. */

import { Banknote, Briefcase, Building, Crown, MapPin, Plus, Target, Users } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, EmptyState, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogs } from '@/features/subscriptions/hooks/useCatalogs';
import type {
  CatalogSalesTeam,
  CatalogMembership,
  CatalogOfficeTarget,
  CatalogSalesPerson,
  CatalogSite,
  CatalogBusinessUnit,
  CatalogsSalesProps,
  SalesRole,
} from '@/features/subscriptions/types';
import { CatalogBar, ConfirmDelete, CatalogErrorView, actionsColumn } from './CatalogCommon';
import { RoleConditionsCard } from './RoleConditions';
import { ROLE_UI } from './SalesForms';
import { TARGET_LEVEL_UI } from './TargetForms';
import { TargetsPanel } from './TargetsPanel';
import { ZonesWithoutTargetPanel } from './ZonesWithoutTarget';
import { overallTarget } from '../../lib/targets';
import { SalesFormModals } from './SalesFormModals';

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

const STRUCTURE = 'estructura';

/** Las ventas del tramo vigente en `mes`: el más reciente que ya empezó (`coordinadoras_oficina.objetivo_vigente`). */
function currentTarget(tiers: CatalogOfficeTarget[], month: string): CatalogOfficeTarget | null {
  let best: CatalogOfficeTarget | null = null;
  for (const t of tiers) {
    if (t.since && t.since > month) continue;
    if (!best || (best.since || '') <= (t.since || '')) best = t;
  }
  return best;
}

/** El nombre principal y, en gris, los otros con los que Odoo escribe a la misma persona. */
function withOthers(main: string, others: string[]) {
  if (others.length === 0) return main;
  return (
    <>
      {main}
      <span className="text-slate-500"> · también «{others.join('», «')}»</span>
    </>
  );
}

export function SalesView(props: CatalogsSalesProps) {
  const {
    teams, memberships, people, conditions, newPerson, coordinators, targets, officeTargets, zonesWithoutTarget,
    monthly_targets: monthTargets, thresholds, targetsConfig, computedPeriods, knownNodes, zones, sites,
  } = props;
  const c = useCatalogs({
    initialView: newPerson.literal && newPerson.equipo ? `${newPerson.equipo}/${newPerson.role}` : `${STRUCTURE}/unidades`,
    newPerson,
    teams,
    sites,
  });
  const [section, sub = ''] = c.view.split('/');
  const team = teams.find((e) => e.slug === section);

  // El general que rige hoy, para decir en los formularios qué se hereda si
  // se deja un valor vacío. La excepción de un mes no cuenta como "heredado"
  // de ese mismo mes, de ahí la configuración sin `meses`.
  const referenceMonth = computedPeriods[0] ?? new Date().toISOString().slice(0, 7);
  const overallToday = overallTarget(targetsConfig, referenceMonth);
  // Solo los nodos cuya zona está en el catálogo pueden tener objetivo de nodo:
  // el objetivo cuelga de la zona. La sucursal, en cambio, vale sin catálogo.
  const zoneNames = new Set(zones.map((z) => z.name.toLowerCase()));
  const catalogNodes = knownNodes.filter((n) => zoneNames.has(n.zona.toLowerCase()));
  const overallWithoutException = (period: string) =>
    overallTarget({ ...targetsConfig, months: {} }, period || referenceMonth);

  // El objetivo de ventas que rige este mes para cada coordinadora: el suyo o el general.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const officeOverall = currentTarget(officeTargets.filter((other) => other.person_id === null), currentMonth);
  const currentOf = (personId: number) =>
    currentTarget(officeTargets.filter((other) => other.person_id === personId), currentMonth) ?? officeOverall;
  const officeCoordinators: CatalogSalesPerson[] = people.filter((p) =>
    p.memberships.some((m) => m.role === 'coord_oficina'));

  const ofRole = (e: CatalogSalesTeam, role: SalesRole) =>
    memberships.filter((m) => m.equipo === e.slug && m.role === role);

  const membershipColumns = (e: CatalogSalesTeam, role: SalesRole): Column<CatalogMembership>[] => {
    const spec = e.roles.find((r) => r.role === role)!;
    const columns: Column<CatalogMembership>[] = [
      { header: 'Nombre', accessor: 'name', sortKey: 'name' },
      { header: 'Apellido', accessor: 'last_name', sortKey: 'last_name' },
    ];
    if (spec.channel) columns.push({ header: 'Medio', accessor: (row) => withOthers(row.channel, row.channel_alias), sortKey: 'channel' });
    if (spec.supervisor) {
      columns.push({
        header: 'Como supervisor',
        accessor: (row) => withOthers(row.supervisor_channel || '', row.supervisor_alias) || <span className="text-slate-500">= medio</span>,
        sortKey: 'supervisor_channel',
      });
    }
    if (spec.user) columns.push({ header: 'Usuario de Odoo', accessor: (row) => withOthers(row.odoo_user, row.user_alias), sortKey: 'odoo_user' });
    if (spec.site) {
      columns.push({
        header: 'Sites',
        accessor: (row) => row.sites.join(', ') || <span className="text-amber-400">sin site</span>,
        filterable: true,
        filterValue: (row) => row.sites.join(', ') || 'Sin site',
      });
      columns.push({
        header: `Objetivo ${currentMonth}`,
        accessor: (row) => {
          const current = currentOf(row.person_id);
          if (!current) return <span className="text-slate-500">sin objetivo</span>;
          return `${current.ventas} ventas${current.person_id === null ? ' (general)' : ''}`;
        },
        align: 'right',
      });
    }
    if (spec.manager) {
      columns.push({
        header: 'Responde a',
        accessor: (row) => row.manager || <span className="text-amber-400">sin asignar</span>,
        sortKey: 'manager',
        filterable: true,
        filterValue: (row) => row.manager || 'Sin asignar',
      });
    }
    if (spec.units) columns.push({ header: 'Unidades', accessor: (row) => row.units.join(', ') || '—' });
    columns.push(actionsColumn<CatalogMembership>(c.editPerson, (row) =>
      c.setDeleting({ kind: 'membresias', id: row.id, name: `${row.name} ${row.last_name} de ${e.name}` })));
    return columns;
  };

  const unitColumns: Column<CatalogBusinessUnit>[] = [
    { header: 'Unidad', accessor: 'name', sortKey: 'name' },
    { header: 'Equipos', accessor: (row) => row.teams.join(', ') || '—', filterable: true, filterValue: (row) => row.teams.join(', ') || 'Ninguno' },
    {
      header: 'Quién la lleva',
      accessor: (row) => (row.owners.length
        ? row.owners.map((r) => `${r.person} (${r.role_label}, ${r.equipo})`).join(' · ')
        : <span className="text-slate-500">— nadie</span>),
    },
    { header: 'Zonas', accessor: 'zones', align: 'right', sortKey: 'zones' },
    actionsColumn<CatalogBusinessUnit>(c.editUnit, (row) =>
      c.setDeleting({ kind: 'coordinadores', id: row.id, name: row.name })),
  ];

  const siteColumns: Column<CatalogSite>[] = [
    { header: 'Site', accessor: 'name', sortKey: 'name' },
    { header: 'Orden', accessor: 'order', align: 'right', sortKey: 'order' },
    { header: 'Equipos', accessor: (row) => row.teams.join(', ') || '—' },
    { header: 'Zonas', accessor: 'zones', align: 'right', sortKey: 'zones' },
    actionsColumn<CatalogSite>(c.editSite, (row) =>
      c.setDeleting({ kind: 'sites', id: row.id, name: row.name })),
  ];

  const officeTargetColumns: Column<CatalogOfficeTarget>[] = [
    {
      header: 'Para',
      accessor: (row) => row.person || <span className="font-semibold text-sky-300">General</span>,
      sortKey: 'person',
      filterable: true,
      filterValue: (row) => row.person || 'General',
    },
    { header: 'Desde', accessor: (row) => row.since || 'siempre', sortKey: 'since' },
    { header: 'Ventas al mes', accessor: 'ventas', align: 'right', sortKey: 'ventas' },
    { header: 'Nota', accessor: (row) => row.note || <span className="text-slate-600">—</span> },
    {
      header: 'Actualizado',
      accessor: (row) => `${row.updated_at}${row.updated_by ? ` · ${row.updated_by}` : ''}`,
      sortKey: 'updated_at',
    },
    actionsColumn<CatalogOfficeTarget>(c.editOfficeTarget, (row) =>
      c.setDeleting({
        kind: 'objetivos_oficina',
        id: row.id,
        name: `el objetivo de ventas ${row.person ? `de ${row.person}` : 'general'} ${row.since ? `desde ${row.since}` : 'desde siempre'}`,
      })),
  ];

  // --- Pestañas y altas de la sección abierta ---
  const structureTabs = [
    { key: `${STRUCTURE}/unidades`, label: `Unidades de negocio (${coordinators.length})`, icon: Crown },
    { key: `${STRUCTURE}/sites`, label: `Sites (${sites.length})`, icon: MapPin },
    { key: `${STRUCTURE}/objetivos`, label: 'Objetivos', icon: Target },
  ];
  const teamTabs = team
    ? [
      ...team.roles.map((r) => ({
        key: `${team.slug}/${r.role}`,
        label: `${ROLE_UI[r.role].short} (${ofRole(team, r.role).length})`,
        icon: Briefcase,
      })),
    ]
    : [];

  const activeRole = team?.roles.find((r) => r.role === sub);
  const create = (() => {
    if (section === STRUCTURE && sub === 'unidades') return { label: 'Nueva unidad', onClick: c.newUnit };
    if (section === STRUCTURE && sub === 'sites') return { label: 'Nuevo site', onClick: c.newSite };
    if (team && activeRole) {
      return {
        label: `Registrar ${activeRole.role_label.toLowerCase()}`,
        onClick: () => c.newEmptyPerson(activeRole.role, team.id, team.slug),
      };
    }
    return undefined;
  })();

  const firstSubscreen = (slug: string) =>
    (slug === STRUCTURE ? 'unidades' : (teams.find((e) => e.slug === slug)?.roles[0]?.role ?? ''));

  // Lo que pide el formulario de la persona abierta.
  const teamDraft = teams.find((e) => e.slug === c.personDraft?.equipo);
  const roleDraft = teamDraft?.roles.find((r) => r.role === c.personDraft?.role);

  return (
    <AppLayout
      toolbar={
        <CatalogBar
          active={section}
          onChange={(key) => c.setView(`${key}/${firstSubscreen(key)}`)}
          tabs={[
            { key: STRUCTURE, label: 'Estructura de ventas', icon: Building },
            ...teams.map((e) => ({ key: e.slug, label: e.name, icon: Users })),
          ]}
        />
      }
    >
      <CatalogErrorView c={c} />

      <CatalogBar
        active={c.view}
        onChange={c.setView}
        create={create}
        tabs={section === STRUCTURE ? structureTabs : teamTabs}
      />

      {section === STRUCTURE && sub === 'unidades' && (
        <NeonContainer title="Unidades de negocio" subtitle="Los grupos de zonas de Unidades de negocio, los equipos que los trabajan y quien los lleva" icon={<Crown className="h-5 w-5" />} theme="green" noPadding>
          <DataTable columns={unitColumns} data={coordinators} searchable searchPlaceholder="Buscar unidad..." />
        </NeonContainer>
      )}

      {section === STRUCTURE && sub === 'sites' && (
        <NeonContainer title="Sites" subtitle="Sedes regionales: lo que muestra el Sales Report, con las zonas y los equipos que las trabajan" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={siteColumns} data={sites} searchable searchPlaceholder="Buscar site..." />
        </NeonContainer>
      )}

      {team && activeRole && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <NeonContainer
            title={`${activeRole.role_label} · ${team.name}`}
            subtitle={ROLE_UI[activeRole.role].description}
            icon={<Briefcase className="h-5 w-5" />}
            theme="green"
            noPadding
          >
            {ofRole(team, activeRole.role).length === 0 ? (
              <EmptyState
                title="Nadie registrado con este rol"
                description="Notificaciones lista los nombres de las suscripciones que el directorio todavía no reconoce."
                icon={<Briefcase />}
              />
            ) : (
              <DataTable
                columns={membershipColumns(team, activeRole.role)}
                data={ofRole(team, activeRole.role)}
                searchable
                searchPlaceholder="Buscar persona..."
              />
            )}
          </NeonContainer>

          <NeonContainer
            title="Condiciones de pago"
            subtitle={`Cómo cobra ${activeRole.role_label.toLowerCase()} en ${team.name}`}
            icon={<Banknote className="h-5 w-5" />}
            theme="purple"
            noPadding
          >
            <RoleConditionsCard
              condition={conditions.find((x) => x.equipo === team.slug && x.role === activeRole.role)}
              onEdit={c.editCondition}
              onReset={(row) => {
                if (row.id === null) {
                  c.setError('Ese rol ya paga con las condiciones de la política.');
                  return;
                }
                c.setDeleting({ kind: 'condiciones_equipo', id: row.id, name: `las condiciones editadas de ${row.role_label} en ${team.name} (vuelve a la política)` });
              }}
            />
          </NeonContainer>
        </div>
      )}

      {section === STRUCTURE && sub === 'objetivos' && (
        <>
          <TargetsPanel
            targets={targets}
            monthTargets={monthTargets}
            thresholds={thresholds}
            config={targetsConfig}
            periods={computedPeriods}
            zones={zones}
            nodes={knownNodes}
            onEditGeneral={c.editTarget}
            onNewTarget={() => c.newTarget('zona')}
            onEditTarget={c.editTarget}
            onDeleteTarget={(row) =>
              c.setDeleting({
                kind: 'objetivos',
                id: row.id,
                name: `el objetivo ${TARGET_LEVEL_UI[row.level].label.toLowerCase()} ${row.entity} ${row.since ? `desde ${row.since}` : 'desde siempre'}`.replace(/\s+/g, ' '),
              })}
            onMonthException={(period, existing) =>
              (existing ? c.editMonthTarget(existing) : c.newMonthTarget(period))}
            onDeleteMonth={(row) =>
              c.setDeleting({ kind: 'objetivos_mes', id: row.id, name: `la excepción de ${row.period}` })}
            onEditTrafficLight={() => c.editTrafficLight(thresholds)}
          />

          <ZonesWithoutTargetPanel
            rows={zonesWithoutTarget}
            zones={zones}
            onDelete={(row) => c.setDeleting({
              kind: 'zonas_sin_objetivo',
              id: row.id,
              name: `el tramo sin objetivo de ${row.zona} (vuelve a medirse en todos sus meses)`,
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
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => c.newOfficeTarget()}>
                Nuevo objetivo de ventas
              </Button>
            }
          >
            {officeTargets.length === 0 ? (
              <EmptyState
                title="Ningún objetivo de ventas todavía"
                description="Crea uno general para todas las coordinadoras y, si alguna tiene uno distinto, el suyo."
                icon={<Target />}
              />
            ) : (
              <DataTable columns={officeTargetColumns} data={officeTargets} searchable searchPlaceholder="Buscar coordinadora..." />
            )}
          </NeonContainer>
        </>
      )}

      <SalesFormModals
        c={c}
        props={props}
        teamDraft={teamDraft}
        roleDraft={roleDraft}
        officeCoordinators={officeCoordinators}
        overallToday={overallToday}
        overallWithoutException={overallWithoutException}
        catalogNodes={catalogNodes}
      />

      <ConfirmDelete c={c} />
    </AppLayout>
  );
}
