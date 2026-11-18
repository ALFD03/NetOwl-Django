import { useState } from 'react';

import { useOnOpen } from '@/shared/hooks/useOnOpen';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { catalogsApi, type CatalogPayload } from '@/shared/lib/api/catalogs';
import type {
  CatalogArea,
  CatalogRoleCondition,
  CatalogMembership,
  CatalogNamed,
  CatalogOfficeTarget,
  CatalogSalesPerson,
  CatalogBusinessUnit,
  CatalogTarget,
  CatalogMonthTarget,
  CatalogPlan,
  CatalogRegulatoryPlan,
  CatalogIgnoredProduct,
  CatalogSite,
  CatalogKind,
  CatalogZone,
  CatalogTargetLevel,
  SalesRole,
  TargetsTrafficLight } from '@/features/subscriptions/types';
import {
  type CatalogView, type ConditionDraft, type IgnoredDraft, type MembershipDraft, type MonthTargetDraft, type NameDraft, type OfficeTargetDraft, type PlanDraft, type RegulatoryDraft, type SiteDraft, type TargetDraft, type TrafficLightDraft, type UnitDraft, type ZoneDraft, membershipSince,
} from '../lib/catalogDrafts';

const asText = (value: number | null): string => (value === null ? '' : String(value));


const EMPTY_PLAN: PlanDraft = {
  name: '',
  tariff: '',
  technology: 'FTTH',
  person_type: 'nat',
  reference: '',
  has_tv: false,
  data_mbps: 0,
  price: 0,
  declare_in_eta: true,
  sme_commission_pct: null,
  regulator_plan_id: null,
  regulator_plan: '',
};

const EMPTY_REGULATORY: RegulatoryDraft = {
  name: '',
  technology: 'FTTH',
  person_type: 'nat',
  data_mbps: 0,
  price: 0,
  has_tv: false,
  is_transport: false,
  notes: '',
};

interface Args {
  /** La pestaña con la que abre la página. */
  initialView: CatalogView;
  sites?: CatalogSite[];
  states?: CatalogNamed[];
  /** Nombre que llega en `?new_plan=`: abre el alta de plan ya rellena. */
  newPlan?: string;
  /** Nombre que llega en `?new_zone=`: abre el alta de zona ya rellena. */
  newZone?: string;
  /** Literal, equipo y rol de `?new_person=&team=&role=`: abre el alta de persona ya rellena. */
  newPerson?: { literal: string; equipo: string; role: string };
  /** Los equipos (id por slug), para resolver `nuevaPersona.equipo`. */
  teams?: { id: number; slug: string }[];
}


/**
 * Estado de una página del módulo de Catálogos.
 *
 * Las cuatro páginas comparten el hook: cada una usa los borradores de sus
 * pestañas y los demás se quedan sin abrir.
 *
 * Cada catálogo tiene su propio borrador en lugar de uno genérico: los campos
 * de un plan y los de una zona no se parecen en nada, y un único objeto suelto
 * obligaría a comprobar en cada formulario qué trae dentro.
 *
 * Tras cada escritura se recarga la página en vez de retocar el estado local:
 * los listados dependen unos de otros (borrar un site cambia lo que puede
 * elegir una zona) y el servidor ya devuelve todo junto.
 */
export function useCatalogs({
  initialView, sites = [], states = [], newPlan = '', newZone = '', newPerson, teams = [],
}: Args) {
  const [view, setView] = useState<CatalogView>(initialView);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que respondió la última escritura que salió bien. Hace falta en las
  // páginas donde se registra en serie (Notificaciones): sin ir a otra página,
  // es lo único que confirma que se guardó.
  const [warning, setNotice] = useState<string | null>(null);

  // `?new_plan=` viene del aviso de la importación, de la pestaña de planes
  // por clasificar del ETA y de las notificaciones: el formulario abre con el
  // nombre ya escrito para no obligar a copiarlo a mano. `?new_zone=`, igual
  // para las zonas. Estado inicial y no efecto: el valor llega con la primera
  // pintada y no vuelve a cambiar mientras la página viva.
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(
    () => (newPlan ? { ...EMPTY_PLAN, name: newPlan } : null),
  );
  const [regulatorDraft, setRegulatorDraft] = useState<RegulatoryDraft | null>(null);
  const emptyZone = (name = ''): ZoneDraft => ({
    name,
    site_id: sites[0]?.id ?? null,
    state_id: states[0]?.id ?? null,
    technology: 'FTTH',
    coordinator_id: null,
  });
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft | null>(
    () => (newZone ? emptyZone(newZone) : null),
  );
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [personDraft, setPersonDraft] = useState<MembershipDraft | null>(() => {
    const team = teams.find((e) => e.slug === newPerson?.equipo);
    return newPerson?.literal && team
      ? membershipSince(newPerson.literal, newPerson.role as SalesRole, team.id, team.slug)
      : null;
  });
  const [conditionDraft, setConditionDraft] = useState<ConditionDraft | null>(null);
  const [unitDraft, setUnitDraft] = useState<UnitDraft | null>(null);
  const [officeTargetDraft, setOfficeTargetDraft] = useState<OfficeTargetDraft | null>(null);
  const [nameDraft, setNameDraft] = useState<NameDraft | null>(null);
  const [ignoredDraft, setIgnoredDraft] = useState<IgnoredDraft | null>(null);
  const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null);
  const [monthTargetDraft, setMonthTargetDraft] = useState<MonthTargetDraft | null>(null);
  const [trafficLightDraft, setTrafficLightDraft] = useState<TrafficLightDraft | null>(null);
  const [deleting, setDeleting] = useState<{ kind: CatalogKind; id: number; name: string } | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = Boolean(planDraft || regulatorDraft || zoneDraft || siteDraft || personDraft || conditionDraft || unitDraft || officeTargetDraft || nameDraft || ignoredDraft || targetDraft || monthTargetDraft || trafficLightDraft || deleting);
  useOnOpen(formOpen, () => setError(null));

  const newEmptyPlan = () => setPlanDraft({ ...EMPTY_PLAN });
  const editPlan = (plan: CatalogPlan) => setPlanDraft({ ...plan });
  const createPlanFrom = (name: string) => setPlanDraft({ ...EMPTY_PLAN, name });

  const newRegulator = () => setRegulatorDraft({ ...EMPTY_REGULATORY });
  // `planes` se queda fuera a propósito: es un conteo que calcula el servidor,
  // no un campo del formulario, y mandarlo de vuelta sería enviar un dato que
  // el backend ignora y que aquí solo confunde.
  const editRegulator = (row: CatalogRegulatoryPlan) =>
    setRegulatorDraft({
      id: row.id,
      name: row.name,
      technology: row.technology,
      person_type: row.person_type,
      data_mbps: row.data_mbps,
      price: row.price,
      has_tv: row.has_tv,
      is_transport: row.is_transport,
      notes: row.notes,
    });

  const newEmptyZone = () => setZoneDraft(emptyZone());
  const createZoneFrom = (name: string) => setZoneDraft(emptyZone(name));
  const editZone = (zone: CatalogZone) =>
    setZoneDraft({
      id: zone.id,
      name: zone.name,
      site_id: zone.site_id,
      state_id: zone.state_id,
      technology: zone.technology,
      coordinator_id: zone.coordinator_id,
    });

  const newSite = () => setSiteDraft({ name: '', order: 999, zone_ids: [], team_ids: [] });
  const editSite = (site: CatalogSite) =>
    setSiteDraft({
      id: site.id, name: site.name, order: site.order, zone_ids: site.zone_ids, team_ids: site.team_ids,
    });

  const newEmptyPerson = (role: SalesRole, teamId: number, team: string) =>
    setPersonDraft(membershipSince('', role, teamId, team));
  const createPersonFrom = (literal: string, role: SalesRole, teamId: number, team: string) =>
    setPersonDraft(membershipSince(literal, role, teamId, team));
  const editPerson = (row: CatalogMembership) =>
    setPersonDraft({
      id: row.id,
      team_id: row.team_id,
      equipo: row.equipo,
      role: row.role,
      person_id: row.person_id,
      name: row.name,
      last_name: row.last_name,
      channel: row.channel,
      supervisor_channel: row.supervisor_channel,
      odoo_user: row.odoo_user,
      channel_alias: row.channel_alias,
      supervisor_alias: row.supervisor_alias,
      user_alias: row.user_alias,
      site_ids: row.site_ids,
      manager_id: row.manager_id,
      unit_ids: row.unit_ids,
    });

  const editCondition = (row: CatalogRoleCondition) =>
    setConditionDraft({
      team_id: row.team_id,
      equipo: row.equipo,
      role: row.role,
      role_label: row.role_label,
      pieces: row.pieces,
      params: structuredClone(row.params),
      policy: row.policy,
    });

  const newUnit = () => setUnitDraft({ name: '', zone_ids: [], team_ids: [] });
  const editUnit = (row: CatalogBusinessUnit) =>
    setUnitDraft({ id: row.id, name: row.name, zone_ids: row.zone_ids, team_ids: row.team_ids });

  const newOfficeTarget = (personId: number | null = null) =>
    setOfficeTargetDraft({ person_id: personId, since: '', ventas: '', note: '' });
  const editOfficeTarget = (row: CatalogOfficeTarget) =>
    setOfficeTargetDraft({
      id: row.id,
      person_id: row.person_id,
      role_label: row.person || 'General (todas las coordinadoras)',
      since: row.since,
      ventas: String(row.ventas),
      note: row.note,
    });

  const newName = (kind: NameDraft['kind']) => setNameDraft({ name: '', kind });
  const editName = (kind: NameDraft['kind'], row: CatalogNamed) =>
    setNameDraft({ id: row.id, name: row.name, kind });

  const newIgnored = (area: CatalogArea) => setIgnoredDraft({ name: '', note: '', area });
  const editIgnored = (row: CatalogIgnoredProduct) =>
    setIgnoredDraft({ id: row.id, name: row.name, note: row.note, area: row.area });

  const newTarget = (level: CatalogTargetLevel) =>
    setTargetDraft({
      level,
      entity_id: null,
      sucursal: '',
      since: '',
      growth_pct: '',
      churn_pct: '',
      note: '',
    });
  const editTarget = (row: CatalogTarget) =>
    setTargetDraft({
      id: row.id,
      level: row.level,
      entity_id: row.entity_id,
      sucursal: row.sucursal,
      role_label: row.entity,
      since: row.since,
      growth_pct: asText(row.growth_pct),
      churn_pct: asText(row.churn_pct),
      note: row.note,
      isBase: row.level === 'general',
    });

  const newMonthTarget = (period = '') =>
    setMonthTargetDraft({ period, growth_pct: '', churn_pct: '', note: '' });
  const editMonthTarget = (row: CatalogMonthTarget) =>
    setMonthTargetDraft({
      id: row.id,
      period: row.period,
      growth_pct: asText(row.growth_pct),
      churn_pct: asText(row.churn_pct),
      note: row.note,
    });

  const editTrafficLight = (trafficLight: TargetsTrafficLight) => setTrafficLightDraft({ ...trafficLight });

  const closeForms = () => {
    setPlanDraft(null);
    setRegulatorDraft(null);
    setZoneDraft(null);
    setSiteDraft(null);
    setPersonDraft(null);
    setConditionDraft(null);
    setUnitDraft(null);
    setOfficeTargetDraft(null);
    setNameDraft(null);
    setIgnoredDraft(null);
    setTargetDraft(null);
    setMonthTargetDraft(null);
    setTrafficLightDraft(null);
  };

  const save = async (kind: CatalogKind, payload: CatalogPayload) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await catalogsApi.save(kind, payload);
      closeForms();
      setNotice(response?.message ?? null);
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar el registro.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Declara que un nombre pendiente nunca será una fila de su catálogo.
   *
   * Es la otra respuesta posible ante un nombre sin registrar: la comprobación
   * no puede distinguir un plan nuevo de un router o una instalación, ni una
   * zona nueva de una mal escrita, así que la decisión la toma quien mira la
   * lista.
   */
  const ignore = (area: CatalogArea, name: string) => save('ignorados', { name, note: '', area });

  /**
   * Registra de una vez varios nombres pendientes de ventas con el mismo rol y equipo.
   *
   * Cada persona sale de `membershipSince`, la misma sugerencia que rellena el
   * formulario suelto: sin revisarla una a una, el nombre y el apellido son
   * una suposición que se corrige después en Catálogos › Ventas. El medio (y
   * el usuario de Odoo) es el literal del export, que es lo que cuenta para el
   * cruce. Lo que no entra se enumera con su motivo; lo demás queda guardado.
   * Los roles que piden más (site, unidades) no se registran en bloque.
   */
  const registerPeople = async (literals: string[], role: SalesRole, teamId: number, team: string) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await catalogsApi.saveBatch(
        'membresias',
        literals.map((literal) => ({ ...membershipSince(literal, role, teamId, team) })),
      );
      if (response.errors.length) {
        const SHOWN = 5;
        const detail = response.errors
          .slice(0, SHOWN)
          .map((e) => `${e.name}: ${e.message}`)
          .join(' · ');
        const rest = response.errors.length - SHOWN;
        setError(`${response.message} No entraron: ${detail}${rest > 0 ? ` · y ${rest} más` : ''}`);
      } else {
        setNotice(response.message);
      }
      return response.saved.length;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo registrar el lote.'));
      return 0;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Vincula nombres del export a alguien ya registrado, como otros nombres suyos.
   *
   * La misma persona sale escrita de dos formas («Maria Campos» y «María
   * Campos») y registrarla otra vez la partiría en dos. No toca sus nombres
   * principales: añade `literal` a cada columna en la que aparecía.
   */
  const linkName = (
    person: CatalogSalesPerson,
    literal: string,
    columns: ('channel_alias' | 'supervisor_alias' | 'user_alias')[],
  ) =>
    save('personas', {
      id: person.id,
      name: person.name,
      last_name: person.last_name,
      ...Object.fromEntries(columns.map((c) => [c, [...person[c], literal]])),
    });

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await catalogsApi.remove(deleting.kind, deleting.id);
      setDeleting(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo eliminar el registro.'));
    } finally {
      setSaving(false);
    }
  };

  return {
    view, setView, saving, error, setError, notice: warning,
    planDraft, setPlanDraft, newEmptyPlan, editPlan, createPlanFrom,
    regulatorDraft, setRegulatorDraft, newRegulator, editRegulator,
    zoneDraft, setZoneDraft, newEmptyZone, createZoneFrom, editZone,
    siteDraft, setSiteDraft, newSite, editSite,
    personDraft, setPersonDraft, newEmptyPerson, createPersonFrom, editPerson,
    conditionDraft, setConditionDraft, editCondition,
    unitDraft, setUnitDraft, newUnit, editUnit,
    officeTargetDraft, setOfficeTargetDraft, newOfficeTarget, editOfficeTarget,
    nameDraft, setNameDraft, newName, editName,
    ignoredDraft, setIgnoredDraft, newIgnored, editIgnored,
    targetDraft, setTargetDraft, newTarget, editTarget,
    monthTargetDraft, setMonthTargetDraft, newMonthTarget, editMonthTarget,
    trafficLightDraft, setTrafficLightDraft, editTrafficLight,
    deleting, setDeleting, confirmDelete,
    closeForms, save, ignore, registerPeople, linkName,
  };
}
