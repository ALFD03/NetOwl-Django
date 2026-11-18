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
  PaymentParameters,
  SalesRole,
  TargetsTrafficLight,
} from '@/features/subscriptions/types';

/** Una fila en edición. Sin `id` es un alta. */
export type PlanDraft = Omit<CatalogPlan, 'id'> & { id?: number };
export type RegulatoryDraft = Omit<CatalogRegulatoryPlan, 'id' | 'plans'> & { id?: number };
export type ZoneDraft = {
  id?: number;
  name: string;
  site_id: number | null;
  state_id: number | null;
  technology: string;
  coordinator_id: number | null;
};
/** Un site en edición: sus zonas y los equipos que lo trabajan se eligen en el mismo formulario. */
export type SiteDraft = { id?: number; name: string; order: number; zone_ids: number[]; team_ids: number[] };
export type NameDraft = { id?: number; name: string; kind: 'estados' };
/**
 * El papel de una persona en un equipo, en edición. En el alta se elige una
 * persona que ya existe (`persona_id`) o se escribe una nueva; equipo y rol no
 * cambian después.
 */
export type MembershipDraft = {
  id?: number;
  team_id: number;
  /** El slug del equipo, para saber qué roles y qué exige cada uno. */
  equipo: string;
  role: SalesRole;
  person_id: number | null;
  name: string;
  last_name: string;
  channel: string;
  supervisor_channel: string;
  odoo_user: string;
  /** Otros nombres de la misma persona en cada columna del export. */
  channel_alias: string[];
  supervisor_alias: string[];
  user_alias: string[];
  site_ids: number[];
  manager_id: number | null;
  unit_ids: number[];
};
export type UnidadDraft = { id?: number; name: string; zone_ids: number[]; team_ids: number[] };
/** Las condiciones de un rol de un equipo en edición: se manda el objeto entero de parámetros. */
export type ConditionDraft = {
  team_id: number;
  role: SalesRole;
  role_label: string;
  equipo: string;
  pieces: CatalogRoleCondition['pieces'];
  params: PaymentParameters;
  policy: PaymentParameters;
};
/**
 * Un tramo del objetivo de ventas de las oficinas. `persona_id` nulo es el
 * general; las ventas van como texto para que el campo pueda quedar vacío.
 */
export type OfficeTargetDraft = {
  id?: number;
  person_id: number | null;
  /** Quién lo tiene, para enseñarlo al editar (la persona no se cambia). */
  role_label?: string;
  since: string;
  ventas: string;
  note: string;
};
export type IgnoredDraft = { id?: number; name: string; note: string; area: CatalogArea };

/**
 * Un tramo de objetivo en edición. Los porcentajes van como texto porque vacío
 * significa algo —"se hereda"— y un `number` no puede estar vacío.
 */
export type TargetDraft = {
  id?: number;
  level: CatalogTargetLevel;
  entity_id: number | null;
  /** La zona de un nodo, por nombre: los nodos salen de los datos, no del catálogo. */
  entity_name?: string;
  /** En los niveles `sucursal` y `zona_sucursal`. */
  sucursal: string;
  /** Cómo se llama lo que tiene el objetivo, para enseñarlo al editar. */
  role_label?: string;
  /** `YYYY-MM`; vacío es "desde siempre". */
  since: string;
  growth_pct: string;
  churn_pct: string;
  note: string;
  /** El objetivo general: uno solo, sin fecha ni valores vacíos. */
  esBase?: boolean;
};
export type MonthTargetDraft = {
  id?: number;
  period: string;
  growth_pct: string;
  churn_pct: string;
  note: string;
};
export type TrafficLightDraft = TargetsTrafficLight;

const asText = (valor: number | null): string => (valor === null ? '' : String(valor));

/**
 * La pestaña activa. Las de Productos, Estructura y Notificaciones son nombres
 * fijos; las de Ventas llevan sección: `estructura/unidades`, `estructura/sites`,
 * `estructura/objetivos` y, por equipo, `<slug>/<rol>` y `<slug>/condiciones`.
 */
export type CatalogView = string;

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

/** Los roles que aparecen en `Vendedor` (usuario de Odoo) y no en `Medio`. */
const ROLES_WITH_USER: SalesRole[] = ['coord_oficina', 'administradora'];

/**
 * Una membresía en blanco del rol y equipo indicados, rellena a partir del
 * literal del export si lo hay.
 *
 * El literal de `Vendedor` (coordinadora de oficina, administradora) es el
 * nombre completo con `(User)`: va entero al usuario de Odoo, y de él se
 * adivinan nombre, apellido y medio —dos nombres y dos apellidos es lo
 * habitual—. Los de `Medio` son ya nombre + apellido y van al medio. Todo
 * queda editable: es una sugerencia.
 */
export function membershipSince(
  literal: string, rol: SalesRole, teamId: number, equipo: string,
): MembershipDraft {
  const base = literal.replace(/\s*\(\s*users?\s*\)\s*$/i, '').trim();
  const partes = base.split(/\s+/).filter(Boolean);
  const vacia = {
    team_id: teamId, equipo, role: rol, person_id: null, supervisor_channel: '', site_ids: [] as number[], manager_id: null,
    channel_alias: [] as string[], supervisor_alias: [] as string[], user_alias: [] as string[],
    unit_ids: [] as number[],
  };
  if (ROLES_WITH_USER.includes(rol)) {
    const corte = partes.length >= 4 ? 2 : 1;
    return {
      ...vacia,
      name: partes.slice(0, corte).join(' '),
      last_name: partes.slice(corte).join(' '),
      channel: rol === 'coord_oficina' ? [partes[0], partes[corte]].filter(Boolean).join(' ') : '',
      odoo_user: literal ? `${base} (User)` : '',
    };
  }
  return { ...vacia, name: partes[0] ?? '', last_name: partes.slice(1).join(' '), channel: base, odoo_user: '' };
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
  initialView: vistaInicial, sites = [], states = [], newPlan = '', newZone = '', newPerson, teams = [],
}: Args) {
  const [vista, setVista] = useState<CatalogView>(vistaInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que respondió la última escritura que salió bien. Hace falta en las
  // páginas donde se registra en serie (Notificaciones): sin ir a otra página,
  // es lo único que confirma que se guardó.
  const [aviso, setNotice] = useState<string | null>(null);

  // `?new_plan=` viene del aviso de la importación, de la pestaña de planes
  // por clasificar del ETA y de las notificaciones: el formulario abre con el
  // nombre ya escrito para no obligar a copiarlo a mano. `?new_zone=`, igual
  // para las zonas. Estado inicial y no efecto: el valor llega con la primera
  // pintada y no vuelve a cambiar mientras la página viva.
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(
    () => (newPlan ? { ...EMPTY_PLAN, name: newPlan } : null),
  );
  const [reguladorDraft, setReguladorDraft] = useState<RegulatoryDraft | null>(null);
  const emptyZone = (nombre = ''): ZoneDraft => ({
    name: nombre,
    site_id: sites[0]?.id ?? null,
    state_id: states[0]?.id ?? null,
    technology: 'FTTH',
    coordinator_id: null,
  });
  const [zonaDraft, setZonaDraft] = useState<ZoneDraft | null>(
    () => (newZone ? emptyZone(newZone) : null),
  );
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [personaDraft, setPersonaDraft] = useState<MembershipDraft | null>(() => {
    const equipo = teams.find((e) => e.slug === newPerson?.equipo);
    return newPerson?.literal && equipo
      ? membershipSince(newPerson.literal, newPerson.role as SalesRole, equipo.id, equipo.slug)
      : null;
  });
  const [condicionDraft, setCondicionDraft] = useState<ConditionDraft | null>(null);
  const [unidadDraft, setUnidadDraft] = useState<UnidadDraft | null>(null);
  const [objetivoOficinaDraft, setObjetivoOficinaDraft] = useState<OfficeTargetDraft | null>(null);
  const [nombreDraft, setNombreDraft] = useState<NameDraft | null>(null);
  const [ignoradoDraft, setIgnoradoDraft] = useState<IgnoredDraft | null>(null);
  const [objetivoDraft, setObjetivoDraft] = useState<TargetDraft | null>(null);
  const [objetivoMesDraft, setObjetivoMesDraft] = useState<MonthTargetDraft | null>(null);
  const [semaforoDraft, setSemaforoDraft] = useState<TrafficLightDraft | null>(null);
  const [borrando, setBorrando] = useState<{ kind: CatalogKind; id: number; name: string } | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = Boolean(planDraft || reguladorDraft || zonaDraft || siteDraft || personaDraft || condicionDraft || unidadDraft || objetivoOficinaDraft || nombreDraft || ignoradoDraft || objetivoDraft || objetivoMesDraft || semaforoDraft || borrando);
  useOnOpen(formOpen, () => setError(null));

  const nuevoPlanVacio = () => setPlanDraft({ ...EMPTY_PLAN });
  const editarPlan = (plan: CatalogPlan) => setPlanDraft({ ...plan });
  const crearPlanDesde = (name: string) => setPlanDraft({ ...EMPTY_PLAN, name });

  const nuevoRegulador = () => setReguladorDraft({ ...EMPTY_REGULATORY });
  // `planes` se queda fuera a propósito: es un conteo que calcula el servidor,
  // no un campo del formulario, y mandarlo de vuelta sería enviar un dato que
  // el backend ignora y que aquí solo confunde.
  const editarRegulador = (row: CatalogRegulatoryPlan) =>
    setReguladorDraft({
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

  const nuevaZonaVacia = () => setZonaDraft(emptyZone());
  const crearZonaDesde = (nombre: string) => setZonaDraft(emptyZone(nombre));
  const editarZona = (zona: CatalogZone) =>
    setZonaDraft({
      id: zona.id,
      name: zona.name,
      site_id: zona.site_id,
      state_id: zona.state_id,
      technology: zona.technology,
      coordinator_id: zona.coordinator_id,
    });

  const nuevoSite = () => setSiteDraft({ name: '', order: 999, zone_ids: [], team_ids: [] });
  const editarSite = (site: CatalogSite) =>
    setSiteDraft({
      id: site.id, name: site.name, order: site.order, zone_ids: site.zone_ids, team_ids: site.team_ids,
    });

  const nuevaPersonaVacia = (rol: SalesRole, teamId: number, equipo: string) =>
    setPersonaDraft(membershipSince('', rol, teamId, equipo));
  const crearPersonaDesde = (literal: string, rol: SalesRole, teamId: number, equipo: string) =>
    setPersonaDraft(membershipSince(literal, rol, teamId, equipo));
  const editarPersona = (row: CatalogMembership) =>
    setPersonaDraft({
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

  const editarCondicion = (row: CatalogRoleCondition) =>
    setCondicionDraft({
      team_id: row.team_id,
      equipo: row.equipo,
      role: row.role,
      role_label: row.role_label,
      pieces: row.pieces,
      params: structuredClone(row.params),
      policy: row.policy,
    });

  const nuevaUnidad = () => setUnidadDraft({ name: '', zone_ids: [], team_ids: [] });
  const editarUnidad = (row: CatalogBusinessUnit) =>
    setUnidadDraft({ id: row.id, name: row.name, zone_ids: row.zone_ids, team_ids: row.team_ids });

  const nuevoObjetivoOficina = (personId: number | null = null) =>
    setObjetivoOficinaDraft({ person_id: personId, since: '', ventas: '', note: '' });
  const editarObjetivoOficina = (row: CatalogOfficeTarget) =>
    setObjetivoOficinaDraft({
      id: row.id,
      person_id: row.person_id,
      role_label: row.person || 'General (todas las coordinadoras)',
      since: row.since,
      ventas: String(row.ventas),
      note: row.note,
    });

  const nuevoNombre = (tipo: NameDraft['kind']) => setNombreDraft({ name: '', kind: tipo });
  const editarNombre = (tipo: NameDraft['kind'], row: CatalogNamed) =>
    setNombreDraft({ id: row.id, name: row.name, kind: tipo });

  const nuevoIgnorado = (area: CatalogArea) => setIgnoradoDraft({ name: '', note: '', area });
  const editarIgnorado = (row: CatalogIgnoredProduct) =>
    setIgnoradoDraft({ id: row.id, name: row.name, note: row.note, area: row.area });

  const nuevoObjetivo = (nivel: CatalogTargetLevel) =>
    setObjetivoDraft({
      level: nivel,
      entity_id: null,
      sucursal: '',
      since: '',
      growth_pct: '',
      churn_pct: '',
      note: '',
    });
  const editarObjetivo = (row: CatalogTarget) =>
    setObjetivoDraft({
      id: row.id,
      level: row.level,
      entity_id: row.entity_id,
      sucursal: row.sucursal,
      role_label: row.entity,
      since: row.since,
      growth_pct: asText(row.growth_pct),
      churn_pct: asText(row.churn_pct),
      note: row.note,
      esBase: row.level === 'general',
    });

  const nuevoObjetivoMes = (periodo = '') =>
    setObjetivoMesDraft({ period: periodo, growth_pct: '', churn_pct: '', note: '' });
  const editarObjetivoMes = (row: CatalogMonthTarget) =>
    setObjetivoMesDraft({
      id: row.id,
      period: row.period,
      growth_pct: asText(row.growth_pct),
      churn_pct: asText(row.churn_pct),
      note: row.note,
    });

  const editarSemaforo = (semaforo: TargetsTrafficLight) => setSemaforoDraft({ ...semaforo });

  const cerrarFormularios = () => {
    setPlanDraft(null);
    setReguladorDraft(null);
    setZonaDraft(null);
    setSiteDraft(null);
    setPersonaDraft(null);
    setCondicionDraft(null);
    setUnidadDraft(null);
    setObjetivoOficinaDraft(null);
    setNombreDraft(null);
    setIgnoradoDraft(null);
    setObjetivoDraft(null);
    setObjetivoMesDraft(null);
    setSemaforoDraft(null);
  };

  const guardar = async (tipo: CatalogKind, payload: CatalogPayload) => {
    setGuardando(true);
    setError(null);
    setNotice(null);
    try {
      const response = await catalogsApi.guardar(tipo, payload);
      cerrarFormularios();
      setNotice(response?.message ?? null);
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar el registro.'));
      return false;
    } finally {
      setGuardando(false);
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
  const ignorar = (area: CatalogArea, nombre: string) => guardar('ignorados', { name: nombre, note: '', area });

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
  const registrarPersonas = async (literals: string[], rol: SalesRole, teamId: number, equipo: string) => {
    setGuardando(true);
    setError(null);
    setNotice(null);
    try {
      const response = await catalogsApi.guardarLote(
        'membresias',
        literals.map((literal) => ({ ...membershipSince(literal, rol, teamId, equipo) })),
      );
      if (response.errors.length) {
        const MOSTRADOS = 5;
        const detalle = response.errors
          .slice(0, MOSTRADOS)
          .map((e) => `${e.name}: ${e.message}`)
          .join(' · ');
        const resto = response.errors.length - MOSTRADOS;
        setError(`${response.message} No entraron: ${detalle}${resto > 0 ? ` · y ${resto} más` : ''}`);
      } else {
        setNotice(response.message);
      }
      return response.saved.length;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo registrar el lote.'));
      return 0;
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Vincula nombres del export a alguien ya registrado, como otros nombres suyos.
   *
   * La misma persona sale escrita de dos formas («Maria Campos» y «María
   * Campos») y registrarla otra vez la partiría en dos. No toca sus nombres
   * principales: añade `literal` a cada columna en la que aparecía.
   */
  const vincularNombre = (
    persona: CatalogSalesPerson,
    literal: string,
    columns: ('channel_alias' | 'supervisor_alias' | 'user_alias')[],
  ) =>
    guardar('personas', {
      id: persona.id,
      name: persona.name,
      last_name: persona.last_name,
      ...Object.fromEntries(columns.map((c) => [c, [...persona[c], literal]])),
    });

  const confirmarBorrado = async () => {
    if (!borrando) return;
    setGuardando(true);
    setError(null);
    try {
      await catalogsApi.eliminar(borrando.kind, borrando.id);
      setBorrando(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo eliminar el registro.'));
    } finally {
      setGuardando(false);
    }
  };

  return {
    vista, setVista, guardando, error, setError, aviso,
    planDraft, setPlanDraft, nuevoPlanVacio, editarPlan, crearPlanDesde,
    reguladorDraft, setReguladorDraft, nuevoRegulador, editarRegulador,
    zonaDraft, setZonaDraft, nuevaZonaVacia, crearZonaDesde, editarZona,
    siteDraft, setSiteDraft, nuevoSite, editarSite,
    personaDraft, setPersonaDraft, nuevaPersonaVacia, crearPersonaDesde, editarPersona,
    condicionDraft, setCondicionDraft, editarCondicion,
    unidadDraft, setUnidadDraft, nuevaUnidad, editarUnidad,
    objetivoOficinaDraft, setObjetivoOficinaDraft, nuevoObjetivoOficina, editarObjetivoOficina,
    nombreDraft, setNombreDraft, nuevoNombre, editarNombre,
    ignoradoDraft, setIgnoradoDraft, nuevoIgnorado, editarIgnorado,
    objetivoDraft, setObjetivoDraft, nuevoObjetivo, editarObjetivo,
    objetivoMesDraft, setObjetivoMesDraft, nuevoObjetivoMes, editarObjetivoMes,
    semaforoDraft, setSemaforoDraft, editarSemaforo,
    borrando, setBorrando, confirmarBorrado,
    cerrarFormularios, guardar, ignorar, registrarPersonas, vincularNombre,
  };
}
