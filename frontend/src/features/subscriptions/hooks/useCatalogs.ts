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
export type RegulatoryDraft = Omit<CatalogRegulatoryPlan, 'id' | 'planes'> & { id?: number };
export type ZoneDraft = {
  id?: number;
  nombre: string;
  site_id: number | null;
  estado_id: number | null;
  tecnologia: string;
  coordinador_id: number | null;
};
/** Un site en edición: sus zonas y los equipos que lo trabajan se eligen en el mismo formulario. */
export type SiteDraft = { id?: number; nombre: string; orden: number; zona_ids: number[]; equipo_ids: number[] };
export type NameDraft = { id?: number; nombre: string; tipo: 'estados' };
/**
 * El papel de una persona en un equipo, en edición. En el alta se elige una
 * persona que ya existe (`persona_id`) o se escribe una nueva; equipo y rol no
 * cambian después.
 */
export type MembershipDraft = {
  id?: number;
  equipo_id: number;
  /** El slug del equipo, para saber qué roles y qué exige cada uno. */
  equipo: string;
  rol: SalesRole;
  persona_id: number | null;
  nombre: string;
  apellido: string;
  medio: string;
  medio_supervisor: string;
  usuario_odoo: string;
  /** Otros nombres de la misma persona en cada columna del export. */
  alias_medio: string[];
  alias_supervisor: string[];
  alias_usuario: string[];
  site_ids: number[];
  superior_id: number | null;
  unidad_ids: number[];
};
export type UnidadDraft = { id?: number; nombre: string; zona_ids: number[]; equipo_ids: number[] };
/** Las condiciones de un rol de un equipo en edición: se manda el objeto entero de parámetros. */
export type ConditionDraft = {
  equipo_id: number;
  rol: SalesRole;
  etiqueta: string;
  equipo: string;
  piezas: CatalogRoleCondition['piezas'];
  parametros: PaymentParameters;
  defecto: PaymentParameters;
};
/**
 * Un tramo del objetivo de ventas de las oficinas. `persona_id` nulo es el
 * general; las ventas van como texto para que el campo pueda quedar vacío.
 */
export type OfficeTargetDraft = {
  id?: number;
  persona_id: number | null;
  /** Quién lo tiene, para enseñarlo al editar (la persona no se cambia). */
  etiqueta?: string;
  desde: string;
  ventas: string;
  nota: string;
};
export type IgnoredDraft = { id?: number; nombre: string; nota: string; area: CatalogArea };

/**
 * Un tramo de objetivo en edición. Los porcentajes van como texto porque vacío
 * significa algo —"se hereda"— y un `number` no puede estar vacío.
 */
export type TargetDraft = {
  id?: number;
  nivel: CatalogTargetLevel;
  entidad_id: number | null;
  /** La zona de un nodo, por nombre: los nodos salen de los datos, no del catálogo. */
  entidad_nombre?: string;
  /** En los niveles `sucursal` y `zona_sucursal`. */
  sucursal: string;
  /** Cómo se llama lo que tiene el objetivo, para enseñarlo al editar. */
  etiqueta?: string;
  /** `YYYY-MM`; vacío es "desde siempre". */
  desde: string;
  crecimiento_pct: string;
  churn_pct: string;
  nota: string;
  /** El objetivo general: uno solo, sin fecha ni valores vacíos. */
  esBase?: boolean;
};
export type MonthTargetDraft = {
  id?: number;
  periodo: string;
  crecimiento_pct: string;
  churn_pct: string;
  nota: string;
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
  nombre: '',
  tarifa: '',
  tecnologia: 'FTTH',
  tipo_persona: 'nat',
  referencia: '',
  tiene_tv: false,
  datas_mbps: 0,
  precio: 0,
  declarar_en_eta: true,
  comision_pyme_pct: null,
  plan_regulador_id: null,
  plan_regulador: '',
};

const EMPTY_REGULATORY: RegulatoryDraft = {
  nombre: '',
  tecnologia: 'FTTH',
  tipo_persona: 'nat',
  datas_mbps: 0,
  precio: 0,
  tiene_tv: false,
  es_transporte: false,
  notas: '',
};

interface Args {
  /** La pestaña con la que abre la página. */
  initialView: CatalogView;
  sites?: CatalogSite[];
  estados?: CatalogNamed[];
  /** Nombre que llega en `?nuevo_plan=`: abre el alta de plan ya rellena. */
  nuevoPlan?: string;
  /** Nombre que llega en `?nueva_zona=`: abre el alta de zona ya rellena. */
  nuevaZona?: string;
  /** Literal, equipo y rol de `?nueva_persona=&equipo=&rol=`: abre el alta de persona ya rellena. */
  nuevaPersona?: { literal: string; equipo: string; rol: string };
  /** Los equipos (id por slug), para resolver `nuevaPersona.equipo`. */
  equipos?: { id: number; slug: string }[];
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
    equipo_id: teamId, equipo, rol, persona_id: null, medio_supervisor: '', site_ids: [] as number[], superior_id: null,
    alias_medio: [] as string[], alias_supervisor: [] as string[], alias_usuario: [] as string[],
    unidad_ids: [] as number[],
  };
  if (ROLES_WITH_USER.includes(rol)) {
    const corte = partes.length >= 4 ? 2 : 1;
    return {
      ...vacia,
      nombre: partes.slice(0, corte).join(' '),
      apellido: partes.slice(corte).join(' '),
      medio: rol === 'coord_oficina' ? [partes[0], partes[corte]].filter(Boolean).join(' ') : '',
      usuario_odoo: literal ? `${base} (User)` : '',
    };
  }
  return { ...vacia, nombre: partes[0] ?? '', apellido: partes.slice(1).join(' '), medio: base, usuario_odoo: '' };
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
  initialView: vistaInicial, sites = [], estados = [], nuevoPlan = '', nuevaZona = '', nuevaPersona, equipos = [],
}: Args) {
  const [vista, setVista] = useState<CatalogView>(vistaInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que respondió la última escritura que salió bien. Hace falta en las
  // páginas donde se registra en serie (Notificaciones): sin ir a otra página,
  // es lo único que confirma que se guardó.
  const [aviso, setNotice] = useState<string | null>(null);

  // `?nuevo_plan=` viene del aviso de la importación, de la pestaña de planes
  // por clasificar del ETA y de las notificaciones: el formulario abre con el
  // nombre ya escrito para no obligar a copiarlo a mano. `?nueva_zona=`, igual
  // para las zonas. Estado inicial y no efecto: el valor llega con la primera
  // pintada y no vuelve a cambiar mientras la página viva.
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(
    () => (nuevoPlan ? { ...EMPTY_PLAN, nombre: nuevoPlan } : null),
  );
  const [reguladorDraft, setReguladorDraft] = useState<RegulatoryDraft | null>(null);
  const emptyZone = (nombre = ''): ZoneDraft => ({
    nombre,
    site_id: sites[0]?.id ?? null,
    estado_id: estados[0]?.id ?? null,
    tecnologia: 'FTTH',
    coordinador_id: null,
  });
  const [zonaDraft, setZonaDraft] = useState<ZoneDraft | null>(
    () => (nuevaZona ? emptyZone(nuevaZona) : null),
  );
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [personaDraft, setPersonaDraft] = useState<MembershipDraft | null>(() => {
    const equipo = equipos.find((e) => e.slug === nuevaPersona?.equipo);
    return nuevaPersona?.literal && equipo
      ? membershipSince(nuevaPersona.literal, nuevaPersona.rol as SalesRole, equipo.id, equipo.slug)
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
  const [borrando, setBorrando] = useState<{ tipo: CatalogKind; id: number; nombre: string } | null>(null);
  // Abrir un formulario empieza de cero: el error que hubiera es de la acción anterior.
  const formOpen = Boolean(planDraft || reguladorDraft || zonaDraft || siteDraft || personaDraft || condicionDraft || unidadDraft || objetivoOficinaDraft || nombreDraft || ignoradoDraft || objetivoDraft || objetivoMesDraft || semaforoDraft || borrando);
  useOnOpen(formOpen, () => setError(null));

  const nuevoPlanVacio = () => setPlanDraft({ ...EMPTY_PLAN });
  const editarPlan = (plan: CatalogPlan) => setPlanDraft({ ...plan });
  const crearPlanDesde = (nombre: string) => setPlanDraft({ ...EMPTY_PLAN, nombre });

  const nuevoRegulador = () => setReguladorDraft({ ...EMPTY_REGULATORY });
  // `planes` se queda fuera a propósito: es un conteo que calcula el servidor,
  // no un campo del formulario, y mandarlo de vuelta sería enviar un dato que
  // el backend ignora y que aquí solo confunde.
  const editarRegulador = (row: CatalogRegulatoryPlan) =>
    setReguladorDraft({
      id: row.id,
      nombre: row.nombre,
      tecnologia: row.tecnologia,
      tipo_persona: row.tipo_persona,
      datas_mbps: row.datas_mbps,
      precio: row.precio,
      tiene_tv: row.tiene_tv,
      es_transporte: row.es_transporte,
      notas: row.notas,
    });

  const nuevaZonaVacia = () => setZonaDraft(emptyZone());
  const crearZonaDesde = (nombre: string) => setZonaDraft(emptyZone(nombre));
  const editarZona = (zona: CatalogZone) =>
    setZonaDraft({
      id: zona.id,
      nombre: zona.nombre,
      site_id: zona.site_id,
      estado_id: zona.estado_id,
      tecnologia: zona.tecnologia,
      coordinador_id: zona.coordinador_id,
    });

  const nuevoSite = () => setSiteDraft({ nombre: '', orden: 999, zona_ids: [], equipo_ids: [] });
  const editarSite = (site: CatalogSite) =>
    setSiteDraft({
      id: site.id, nombre: site.nombre, orden: site.orden, zona_ids: site.zona_ids, equipo_ids: site.equipo_ids,
    });

  const nuevaPersonaVacia = (rol: SalesRole, teamId: number, equipo: string) =>
    setPersonaDraft(membershipSince('', rol, teamId, equipo));
  const crearPersonaDesde = (literal: string, rol: SalesRole, teamId: number, equipo: string) =>
    setPersonaDraft(membershipSince(literal, rol, teamId, equipo));
  const editarPersona = (row: CatalogMembership) =>
    setPersonaDraft({
      id: row.id,
      equipo_id: row.equipo_id,
      equipo: row.equipo,
      rol: row.rol,
      persona_id: row.persona_id,
      nombre: row.nombre,
      apellido: row.apellido,
      medio: row.medio,
      medio_supervisor: row.medio_supervisor,
      usuario_odoo: row.usuario_odoo,
      alias_medio: row.alias_medio,
      alias_supervisor: row.alias_supervisor,
      alias_usuario: row.alias_usuario,
      site_ids: row.site_ids,
      superior_id: row.superior_id,
      unidad_ids: row.unidad_ids,
    });

  const editarCondicion = (row: CatalogRoleCondition) =>
    setCondicionDraft({
      equipo_id: row.equipo_id,
      equipo: row.equipo,
      rol: row.rol,
      etiqueta: row.etiqueta,
      piezas: row.piezas,
      parametros: structuredClone(row.parametros),
      defecto: row.defecto,
    });

  const nuevaUnidad = () => setUnidadDraft({ nombre: '', zona_ids: [], equipo_ids: [] });
  const editarUnidad = (row: CatalogBusinessUnit) =>
    setUnidadDraft({ id: row.id, nombre: row.nombre, zona_ids: row.zona_ids, equipo_ids: row.equipo_ids });

  const nuevoObjetivoOficina = (personId: number | null = null) =>
    setObjetivoOficinaDraft({ persona_id: personId, desde: '', ventas: '', nota: '' });
  const editarObjetivoOficina = (row: CatalogOfficeTarget) =>
    setObjetivoOficinaDraft({
      id: row.id,
      persona_id: row.persona_id,
      etiqueta: row.persona || 'General (todas las coordinadoras)',
      desde: row.desde,
      ventas: String(row.ventas),
      nota: row.nota,
    });

  const nuevoNombre = (tipo: NameDraft['tipo']) => setNombreDraft({ nombre: '', tipo });
  const editarNombre = (tipo: NameDraft['tipo'], row: CatalogNamed) =>
    setNombreDraft({ id: row.id, nombre: row.nombre, tipo });

  const nuevoIgnorado = (area: CatalogArea) => setIgnoradoDraft({ nombre: '', nota: '', area });
  const editarIgnorado = (row: CatalogIgnoredProduct) =>
    setIgnoradoDraft({ id: row.id, nombre: row.nombre, nota: row.nota, area: row.area });

  const nuevoObjetivo = (nivel: CatalogTargetLevel) =>
    setObjetivoDraft({
      nivel,
      entidad_id: null,
      sucursal: '',
      desde: '',
      crecimiento_pct: '',
      churn_pct: '',
      nota: '',
    });
  const editarObjetivo = (row: CatalogTarget) =>
    setObjetivoDraft({
      id: row.id,
      nivel: row.nivel,
      entidad_id: row.entidad_id,
      sucursal: row.sucursal,
      etiqueta: row.entidad,
      desde: row.desde,
      crecimiento_pct: asText(row.crecimiento_pct),
      churn_pct: asText(row.churn_pct),
      nota: row.nota,
      esBase: row.nivel === 'general',
    });

  const nuevoObjetivoMes = (periodo = '') =>
    setObjetivoMesDraft({ periodo, crecimiento_pct: '', churn_pct: '', nota: '' });
  const editarObjetivoMes = (row: CatalogMonthTarget) =>
    setObjetivoMesDraft({
      id: row.id,
      periodo: row.periodo,
      crecimiento_pct: asText(row.crecimiento_pct),
      churn_pct: asText(row.churn_pct),
      nota: row.nota,
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
  const ignorar = (area: CatalogArea, nombre: string) => guardar('ignorados', { nombre, nota: '', area });

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
      if (response.errores.length) {
        const MOSTRADOS = 5;
        const detalle = response.errores
          .slice(0, MOSTRADOS)
          .map((e) => `${e.nombre}: ${e.message}`)
          .join(' · ');
        const resto = response.errores.length - MOSTRADOS;
        setError(`${response.message} No entraron: ${detalle}${resto > 0 ? ` · y ${resto} más` : ''}`);
      } else {
        setNotice(response.message);
      }
      return response.registrados.length;
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
    columns: ('alias_medio' | 'alias_supervisor' | 'alias_usuario')[],
  ) =>
    guardar('personas', {
      id: persona.id,
      nombre: persona.nombre,
      apellido: persona.apellido,
      ...Object.fromEntries(columns.map((c) => [c, [...persona[c], literal]])),
    });

  const confirmarBorrado = async () => {
    if (!borrando) return;
    setGuardando(true);
    setError(null);
    try {
      await catalogsApi.eliminar(borrando.tipo, borrando.id);
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
