/** Catálogos › Ventas: la estructura de ventas, los equipos con su gente y sus condiciones, y los objetivos. */

import { Banknote, Briefcase, Building, Crown, MapPin, Plus, Target, TrafficCone, Users } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, EmptyState, Modal, NeonContainer, type Column } from '@/shared/ui';
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
import { CatalogBar, ConfirmarBorrado, CatalogErrorView, actionsColumn, enviar } from './CatalogCommon';
import { ConditionsForm, RoleConditionsCard } from './RoleConditions';
import { MembershipForm, OfficeTargetForm, ROL_UI, SiteForm, UnidadForm } from './SalesForms';
import { TARGET_LEVEL_UI, TargetForm, MonthTargetForm, TrafficLightForm } from './TargetForms';
import { TargetsPanel } from './TargetsPanel';
import { ZonesWithoutTargetPanel } from './ZonesWithoutTarget';
import { overallTarget } from '../../lib/targets';

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
function currentTarget(tramos: CatalogOfficeTarget[], mes: string): CatalogOfficeTarget | null {
  let mejor: CatalogOfficeTarget | null = null;
  for (const t of tramos) {
    if (t.since && t.since > mes) continue;
    if (!mejor || (mejor.since || '') <= (t.since || '')) mejor = t;
  }
  return mejor;
}

/** El nombre principal y, en gris, los otros con los que Odoo escribe a la misma persona. */
function withOthers(principal: string, others: string[]) {
  if (others.length === 0) return principal;
  return (
    <>
      {principal}
      <span className="text-slate-500"> · también «{others.join('», «')}»</span>
    </>
  );
}

export function SalesView({
  teams,
  memberships,
  people,
  conditions,
  newPerson,
  coordinators,
  targets,
  officeTargets,
  zonesWithoutTarget,
  monthly_targets: objetivosMes,
  thresholds,
  targetsConfig,
  computedPeriods,
  knownNodes,
  zones,
  sites,
  states,
}: CatalogsSalesProps) {
  const c = useCatalogs({
    initialView: newPerson.literal && newPerson.equipo ? `${newPerson.equipo}/${newPerson.role}` : `${ESTRUCTURA}/unidades`,
    newPerson,
    teams,
    sites,
  });
  const [seccion, sub = ''] = c.vista.split('/');
  const equipo = teams.find((e) => e.slug === seccion);

  // El general que rige hoy, para decir en los formularios qué se hereda si
  // se deja un valor vacío. La excepción de un mes no cuenta como "heredado"
  // de ese mismo mes, de ahí la configuración sin `meses`.
  const referenceMonth = computedPeriods[0] ?? new Date().toISOString().slice(0, 7);
  const overallToday = overallTarget(targetsConfig, referenceMonth);
  // Solo los nodos cuya zona está en el catálogo pueden tener objetivo de nodo:
  // el objetivo cuelga de la zona. La sucursal, en cambio, vale sin catálogo.
  const zoneNames = new Set(zones.map((z) => z.name.toLowerCase()));
  const catalogNodes = knownNodes.filter((n) => zoneNames.has(n.zona.toLowerCase()));
  const overallWithoutException = (periodo: string) =>
    overallTarget({ ...targetsConfig, months: {} }, periodo || referenceMonth);

  // El objetivo de ventas que rige este mes para cada coordinadora: el suyo o el general.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const officeOverall = currentTarget(officeTargets.filter((other) => other.person_id === null), currentMonth);
  const currentOf = (personId: number) =>
    currentTarget(officeTargets.filter((other) => other.person_id === personId), currentMonth) ?? officeOverall;
  const coordinadorasOficina: CatalogSalesPerson[] = people.filter((p) =>
    p.memberships.some((m) => m.role === 'coord_oficina'));

  const ofRole = (e: CatalogSalesTeam, rol: SalesRole) =>
    memberships.filter((m) => m.equipo === e.slug && m.role === rol);

  const membershipColumns = (e: CatalogSalesTeam, rol: SalesRole): Column<CatalogMembership>[] => {
    const spec = e.roles.find((r) => r.role === rol)!;
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
    columns.push(actionsColumn<CatalogMembership>(c.editarPersona, (row) =>
      c.setBorrando({ kind: 'membresias', id: row.id, name: `${row.name} ${row.last_name} de ${e.name}` })));
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
    actionsColumn<CatalogBusinessUnit>(c.editarUnidad, (row) =>
      c.setBorrando({ kind: 'coordinadores', id: row.id, name: row.name })),
  ];

  const siteColumns: Column<CatalogSite>[] = [
    { header: 'Site', accessor: 'name', sortKey: 'name' },
    { header: 'Orden', accessor: 'order', align: 'right', sortKey: 'order' },
    { header: 'Equipos', accessor: (row) => row.teams.join(', ') || '—' },
    { header: 'Zonas', accessor: 'zones', align: 'right', sortKey: 'zones' },
    actionsColumn<CatalogSite>(c.editarSite, (row) =>
      c.setBorrando({ kind: 'sites', id: row.id, name: row.name })),
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
    actionsColumn<CatalogOfficeTarget>(c.editarObjetivoOficina, (row) =>
      c.setBorrando({
        kind: 'objetivos_oficina',
        id: row.id,
        name: `el objetivo de ventas ${row.person ? `de ${row.person}` : 'general'} ${row.since ? `desde ${row.since}` : 'desde siempre'}`,
      })),
  ];

  // --- Pestañas y altas de la sección abierta ---
  const pestanasEstructura = [
    { key: `${ESTRUCTURA}/unidades`, label: `Unidades de negocio (${coordinators.length})`, icon: Crown },
    { key: `${ESTRUCTURA}/sites`, label: `Sites (${sites.length})`, icon: MapPin },
    { key: `${ESTRUCTURA}/objetivos`, label: 'Objetivos', icon: Target },
  ];
  const teamTabs = equipo
    ? [
      ...equipo.roles.map((r) => ({
        key: `${equipo.slug}/${r.role}`,
        label: `${ROL_UI[r.role].corto} (${ofRole(equipo, r.role).length})`,
        icon: Briefcase,
      })),
    ]
    : [];

  const activeRole = equipo?.roles.find((r) => r.role === sub);
  const alta = (() => {
    if (seccion === ESTRUCTURA && sub === 'unidades') return { label: 'Nueva unidad', onClick: c.nuevaUnidad };
    if (seccion === ESTRUCTURA && sub === 'sites') return { label: 'Nuevo site', onClick: c.nuevoSite };
    if (equipo && activeRole) {
      return {
        label: `Registrar ${activeRole.role_label.toLowerCase()}`,
        onClick: () => c.nuevaPersonaVacia(activeRole.role, equipo.id, equipo.slug),
      };
    }
    return undefined;
  })();

  const firstSubscreen = (slug: string) =>
    (slug === ESTRUCTURA ? 'unidades' : (teams.find((e) => e.slug === slug)?.roles[0]?.role ?? ''));

  // Lo que pide el formulario de la persona abierta.
  const teamDraft = teams.find((e) => e.slug === c.personaDraft?.equipo);
  const rolDraft = teamDraft?.roles.find((r) => r.role === c.personaDraft?.role);

  return (
    <AppLayout
      toolbar={
        <CatalogBar
          activa={seccion}
          onChange={(key) => c.setVista(`${key}/${firstSubscreen(key)}`)}
          pestanas={[
            { key: ESTRUCTURA, label: 'Estructura de ventas', icon: Building },
            ...teams.map((e) => ({ key: e.slug, label: e.name, icon: Users })),
          ]}
        />
      }
    >
      <CatalogErrorView c={c} />

      <CatalogBar
        activa={c.vista}
        onChange={c.setVista}
        alta={alta}
        pestanas={seccion === ESTRUCTURA ? pestanasEstructura : teamTabs}
      />

      {seccion === ESTRUCTURA && sub === 'unidades' && (
        <NeonContainer title="Unidades de negocio" subtitle="Los grupos de zonas de Unidades de negocio, los equipos que los trabajan y quien los lleva" icon={<Crown className="h-5 w-5" />} theme="green" noPadding>
          <DataTable columns={unitColumns} data={coordinators} searchable searchPlaceholder="Buscar unidad..." />
        </NeonContainer>
      )}

      {seccion === ESTRUCTURA && sub === 'sites' && (
        <NeonContainer title="Sites" subtitle="Sedes regionales: lo que muestra el Sales Report, con las zonas y los equipos que las trabajan" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={siteColumns} data={sites} searchable searchPlaceholder="Buscar site..." />
        </NeonContainer>
      )}

      {equipo && activeRole && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <NeonContainer
            title={`${activeRole.role_label} · ${equipo.name}`}
            subtitle={ROL_UI[activeRole.role].description}
            icon={<Briefcase className="h-5 w-5" />}
            theme="green"
            noPadding
          >
            {ofRole(equipo, activeRole.role).length === 0 ? (
              <EmptyState
                title="Nadie registrado con este rol"
                description="Notificaciones lista los nombres de las suscripciones que el directorio todavía no reconoce."
                icon={<Briefcase />}
              />
            ) : (
              <DataTable
                columns={membershipColumns(equipo, activeRole.role)}
                data={ofRole(equipo, activeRole.role)}
                searchable
                searchPlaceholder="Buscar persona..."
              />
            )}
          </NeonContainer>

          <NeonContainer
            title="Condiciones de pago"
            subtitle={`Cómo cobra ${activeRole.role_label.toLowerCase()} en ${equipo.name}`}
            icon={<Banknote className="h-5 w-5" />}
            theme="purple"
            noPadding
          >
            <RoleConditionsCard
              condicion={conditions.find((x) => x.equipo === equipo.slug && x.role === activeRole.role)}
              onEditar={c.editarCondicion}
              onRestablecer={(row) => {
                if (row.id === null) {
                  c.setError('Ese rol ya paga con las condiciones de la política.');
                  return;
                }
                c.setBorrando({ kind: 'condiciones_equipo', id: row.id, name: `las condiciones editadas de ${row.role_label} en ${equipo.name} (vuelve a la política)` });
              }}
            />
          </NeonContainer>
        </div>
      )}

      {seccion === ESTRUCTURA && sub === 'objetivos' && (
        <>
          <TargetsPanel
            targets={targets}
            monthTargets={objetivosMes}
            thresholds={thresholds}
            config={targetsConfig}
            periodos={computedPeriods}
            zones={zones}
            nodos={knownNodes}
            onEditarGeneral={c.editarObjetivo}
            onNewTarget={() => c.nuevoObjetivo('zona')}
            onEditTarget={c.editarObjetivo}
            onDeleteTarget={(row) =>
              c.setBorrando({
                kind: 'objetivos',
                id: row.id,
                name: `el objetivo ${TARGET_LEVEL_UI[row.level].label.toLowerCase()} ${row.entity} ${row.since ? `desde ${row.since}` : 'desde siempre'}`.replace(/\s+/g, ' '),
              })}
            onMonthException={(periodo, existente) =>
              (existente ? c.editarObjetivoMes(existente) : c.nuevoObjetivoMes(periodo))}
            onDeleteMonth={(row) =>
              c.setBorrando({ kind: 'objetivos_mes', id: row.id, name: `la excepción de ${row.period}` })}
            onEditTrafficLight={() => c.editarSemaforo(thresholds)}
          />

          <ZonesWithoutTargetPanel
            rows={zonesWithoutTarget}
            zones={zones}
            onDelete={(row) => c.setBorrando({
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
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => c.nuevoObjetivoOficina()}>
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

      <Modal
        isOpen={Boolean(c.personaDraft && teamDraft && rolDraft)}
        onClose={c.cerrarFormularios}
        title={c.personaDraft?.id ? 'Editar persona del equipo' : 'Registrar persona en el equipo'}
        subtitle="Cómo aparece en las suscripciones: es contra esto que Comisiones reparte cada venta"
        icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.personaDraft && teamDraft && rolDraft && (
          <MembershipForm
            value={c.personaDraft}
            teams={teams}
            equipo={teamDraft}
            role={rolDraft}
            people={people}
            memberships={memberships}
            sites={sites}
            units={coordinators}
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
          <ConditionsForm
            value={c.condicionDraft}
            saving={c.guardando}
            onChange={(patch) => c.setCondicionDraft({ ...c.condicionDraft!, ...patch })}
            onSubmit={(e) =>
              enviar(e, () => c.guardar('condiciones_equipo', {
                team_id: c.condicionDraft!.team_id,
                role: c.condicionDraft!.role,
                params: c.condicionDraft!.params,
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
          <OfficeTargetForm
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
            zones={zones}
            teams={teams}
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
            zones={zones}
            teams={teams}
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
          <TargetForm
            value={c.objetivoDraft}
            entities={{ zona: zones, site: sites, estado: states, coordinador: coordinators }}
            nodos={catalogNodes}
            general={overallToday}
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
          <MonthTargetForm
            value={c.objetivoMesDraft}
            periodos={computedPeriods}
            general={overallWithoutException(c.objetivoMesDraft.period)}
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
          <TrafficLightForm
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
