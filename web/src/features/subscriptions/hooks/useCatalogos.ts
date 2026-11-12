import { useState } from 'react';
import { router } from '@inertiajs/react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { catalogosApi, type CatalogoPayload } from '@/shared/lib/api/catalogos';
import type {
  AreaCatalogo,
  CatalogoCondicionRol,
  CatalogoMembresia,
  CatalogoNombrado,
  CatalogoObjetivoOficina,
  CatalogoPersonaVentas,
  CatalogoUnidadNegocio,
  CatalogoObjetivo,
  CatalogoObjetivoMes,
  CatalogoPlan,
  CatalogoPlanRegulador,
  CatalogoProductoIgnorado,
  CatalogoSite,
  CatalogoTipo,
  CatalogoZona,
  NivelObjetivoCatalogo,
  ParametrosPago,
  RolVentas,
  SemaforoObjetivos,
} from '@/features/subscriptions/types';

/** Una fila en edición. Sin `id` es un alta. */
export type PlanDraft = Omit<CatalogoPlan, 'id'> & { id?: number };
export type ReguladorDraft = Omit<CatalogoPlanRegulador, 'id' | 'planes'> & { id?: number };
export type ZonaDraft = {
  id?: number;
  nombre: string;
  site_id: number | null;
  estado_id: number | null;
  tecnologia: string;
  coordinador_id: number | null;
};
/** Un site en edición: sus zonas y los equipos que lo trabajan se eligen en el mismo formulario. */
export type SiteDraft = { id?: number; nombre: string; orden: number; zona_ids: number[]; equipo_ids: number[] };
export type NombreDraft = { id?: number; nombre: string; tipo: 'estados' };
/**
 * El papel de una persona en un equipo, en edición. En el alta se elige una
 * persona que ya existe (`persona_id`) o se escribe una nueva; equipo y rol no
 * cambian después.
 */
export type MembresiaDraft = {
  id?: number;
  equipo_id: number;
  /** El slug del equipo, para saber qué roles y qué exige cada uno. */
  equipo: string;
  rol: RolVentas;
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
export type CondicionDraft = {
  equipo_id: number;
  rol: RolVentas;
  etiqueta: string;
  equipo: string;
  piezas: CatalogoCondicionRol['piezas'];
  parametros: ParametrosPago;
  defecto: ParametrosPago;
};
/**
 * Un tramo del objetivo de ventas de las oficinas. `persona_id` nulo es el
 * general; las ventas van como texto para que el campo pueda quedar vacío.
 */
export type ObjetivoOficinaDraft = {
  id?: number;
  persona_id: number | null;
  /** Quién lo tiene, para enseñarlo al editar (la persona no se cambia). */
  etiqueta?: string;
  desde: string;
  ventas: string;
  nota: string;
};
export type IgnoradoDraft = { id?: number; nombre: string; nota: string; area: AreaCatalogo };

/**
 * Un tramo de objetivo en edición. Los porcentajes van como texto porque vacío
 * significa algo —"se hereda"— y un `number` no puede estar vacío.
 */
export type ObjetivoDraft = {
  id?: number;
  nivel: NivelObjetivoCatalogo;
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
export type ObjetivoMesDraft = {
  id?: number;
  periodo: string;
  crecimiento_pct: string;
  churn_pct: string;
  nota: string;
};
export type SemaforoDraft = SemaforoObjetivos;

const comoTexto = (valor: number | null): string => (valor === null ? '' : String(valor));

/**
 * La pestaña activa. Las de Productos, Estructura y Notificaciones son nombres
 * fijos; las de Ventas llevan sección: `estructura/unidades`, `estructura/sites`,
 * `estructura/objetivos` y, por equipo, `<slug>/<rol>` y `<slug>/condiciones`.
 */
export type CatalogoVista = string;

const PLAN_VACIO: PlanDraft = {
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

const REGULADOR_VACIO: ReguladorDraft = {
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
  vistaInicial: CatalogoVista;
  sites?: CatalogoSite[];
  estados?: CatalogoNombrado[];
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
const ROLES_CON_USUARIO: RolVentas[] = ['coord_oficina', 'administradora'];

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
export function membresiaDesde(
  literal: string, rol: RolVentas, equipoId: number, equipo: string,
): MembresiaDraft {
  const base = literal.replace(/\s*\(\s*users?\s*\)\s*$/i, '').trim();
  const partes = base.split(/\s+/).filter(Boolean);
  const vacia = {
    equipo_id: equipoId, equipo, rol, persona_id: null, medio_supervisor: '', site_ids: [] as number[], superior_id: null,
    alias_medio: [] as string[], alias_supervisor: [] as string[], alias_usuario: [] as string[],
    unidad_ids: [] as number[],
  };
  if (ROLES_CON_USUARIO.includes(rol)) {
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
export function useCatalogos({
  vistaInicial, sites = [], estados = [], nuevoPlan = '', nuevaZona = '', nuevaPersona, equipos = [],
}: Args) {
  const [vista, setVista] = useState<CatalogoVista>(vistaInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo que respondió la última escritura que salió bien. Hace falta en las
  // páginas donde se registra en serie (Notificaciones): sin ir a otra página,
  // es lo único que confirma que se guardó.
  const [aviso, setAviso] = useState<string | null>(null);

  // `?nuevo_plan=` viene del aviso de la importación, de la pestaña de planes
  // por clasificar del ETA y de las notificaciones: el formulario abre con el
  // nombre ya escrito para no obligar a copiarlo a mano. `?nueva_zona=`, igual
  // para las zonas. Estado inicial y no efecto: el valor llega con la primera
  // pintada y no vuelve a cambiar mientras la página viva.
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(
    () => (nuevoPlan ? { ...PLAN_VACIO, nombre: nuevoPlan } : null),
  );
  const [reguladorDraft, setReguladorDraft] = useState<ReguladorDraft | null>(null);
  const zonaVacia = (nombre = ''): ZonaDraft => ({
    nombre,
    site_id: sites[0]?.id ?? null,
    estado_id: estados[0]?.id ?? null,
    tecnologia: 'FTTH',
    coordinador_id: null,
  });
  const [zonaDraft, setZonaDraft] = useState<ZonaDraft | null>(
    () => (nuevaZona ? zonaVacia(nuevaZona) : null),
  );
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [personaDraft, setPersonaDraft] = useState<MembresiaDraft | null>(() => {
    const equipo = equipos.find((e) => e.slug === nuevaPersona?.equipo);
    return nuevaPersona?.literal && equipo
      ? membresiaDesde(nuevaPersona.literal, nuevaPersona.rol as RolVentas, equipo.id, equipo.slug)
      : null;
  });
  const [condicionDraft, setCondicionDraft] = useState<CondicionDraft | null>(null);
  const [unidadDraft, setUnidadDraft] = useState<UnidadDraft | null>(null);
  const [objetivoOficinaDraft, setObjetivoOficinaDraft] = useState<ObjetivoOficinaDraft | null>(null);
  const [nombreDraft, setNombreDraft] = useState<NombreDraft | null>(null);
  const [ignoradoDraft, setIgnoradoDraft] = useState<IgnoradoDraft | null>(null);
  const [objetivoDraft, setObjetivoDraft] = useState<ObjetivoDraft | null>(null);
  const [objetivoMesDraft, setObjetivoMesDraft] = useState<ObjetivoMesDraft | null>(null);
  const [semaforoDraft, setSemaforoDraft] = useState<SemaforoDraft | null>(null);
  const [borrando, setBorrando] = useState<{ tipo: CatalogoTipo; id: number; nombre: string } | null>(null);

  const nuevoPlanVacio = () => setPlanDraft({ ...PLAN_VACIO });
  const editarPlan = (plan: CatalogoPlan) => setPlanDraft({ ...plan });
  const crearPlanDesde = (nombre: string) => setPlanDraft({ ...PLAN_VACIO, nombre });

  const nuevoRegulador = () => setReguladorDraft({ ...REGULADOR_VACIO });
  // `planes` se queda fuera a propósito: es un conteo que calcula el servidor,
  // no un campo del formulario, y mandarlo de vuelta sería enviar un dato que
  // el backend ignora y que aquí solo confunde.
  const editarRegulador = (fila: CatalogoPlanRegulador) =>
    setReguladorDraft({
      id: fila.id,
      nombre: fila.nombre,
      tecnologia: fila.tecnologia,
      tipo_persona: fila.tipo_persona,
      datas_mbps: fila.datas_mbps,
      precio: fila.precio,
      tiene_tv: fila.tiene_tv,
      es_transporte: fila.es_transporte,
      notas: fila.notas,
    });

  const nuevaZonaVacia = () => setZonaDraft(zonaVacia());
  const crearZonaDesde = (nombre: string) => setZonaDraft(zonaVacia(nombre));
  const editarZona = (zona: CatalogoZona) =>
    setZonaDraft({
      id: zona.id,
      nombre: zona.nombre,
      site_id: zona.site_id,
      estado_id: zona.estado_id,
      tecnologia: zona.tecnologia,
      coordinador_id: zona.coordinador_id,
    });

  const nuevoSite = () => setSiteDraft({ nombre: '', orden: 999, zona_ids: [], equipo_ids: [] });
  const editarSite = (site: CatalogoSite) =>
    setSiteDraft({
      id: site.id, nombre: site.nombre, orden: site.orden, zona_ids: site.zona_ids, equipo_ids: site.equipo_ids,
    });

  const nuevaPersonaVacia = (rol: RolVentas, equipoId: number, equipo: string) =>
    setPersonaDraft(membresiaDesde('', rol, equipoId, equipo));
  const crearPersonaDesde = (literal: string, rol: RolVentas, equipoId: number, equipo: string) =>
    setPersonaDraft(membresiaDesde(literal, rol, equipoId, equipo));
  const editarPersona = (fila: CatalogoMembresia) =>
    setPersonaDraft({
      id: fila.id,
      equipo_id: fila.equipo_id,
      equipo: fila.equipo,
      rol: fila.rol,
      persona_id: fila.persona_id,
      nombre: fila.nombre,
      apellido: fila.apellido,
      medio: fila.medio,
      medio_supervisor: fila.medio_supervisor,
      usuario_odoo: fila.usuario_odoo,
      alias_medio: fila.alias_medio,
      alias_supervisor: fila.alias_supervisor,
      alias_usuario: fila.alias_usuario,
      site_ids: fila.site_ids,
      superior_id: fila.superior_id,
      unidad_ids: fila.unidad_ids,
    });

  const editarCondicion = (fila: CatalogoCondicionRol) =>
    setCondicionDraft({
      equipo_id: fila.equipo_id,
      equipo: fila.equipo,
      rol: fila.rol,
      etiqueta: fila.etiqueta,
      piezas: fila.piezas,
      parametros: structuredClone(fila.parametros),
      defecto: fila.defecto,
    });

  const nuevaUnidad = () => setUnidadDraft({ nombre: '', zona_ids: [], equipo_ids: [] });
  const editarUnidad = (fila: CatalogoUnidadNegocio) =>
    setUnidadDraft({ id: fila.id, nombre: fila.nombre, zona_ids: fila.zona_ids, equipo_ids: fila.equipo_ids });

  const nuevoObjetivoOficina = (personaId: number | null = null) =>
    setObjetivoOficinaDraft({ persona_id: personaId, desde: '', ventas: '', nota: '' });
  const editarObjetivoOficina = (fila: CatalogoObjetivoOficina) =>
    setObjetivoOficinaDraft({
      id: fila.id,
      persona_id: fila.persona_id,
      etiqueta: fila.persona || 'General (todas las coordinadoras)',
      desde: fila.desde,
      ventas: String(fila.ventas),
      nota: fila.nota,
    });

  const nuevoNombre = (tipo: NombreDraft['tipo']) => setNombreDraft({ nombre: '', tipo });
  const editarNombre = (tipo: NombreDraft['tipo'], fila: CatalogoNombrado) =>
    setNombreDraft({ id: fila.id, nombre: fila.nombre, tipo });

  const nuevoIgnorado = (area: AreaCatalogo) => setIgnoradoDraft({ nombre: '', nota: '', area });
  const editarIgnorado = (fila: CatalogoProductoIgnorado) =>
    setIgnoradoDraft({ id: fila.id, nombre: fila.nombre, nota: fila.nota, area: fila.area });

  const nuevoObjetivo = (nivel: NivelObjetivoCatalogo) =>
    setObjetivoDraft({
      nivel,
      entidad_id: null,
      sucursal: '',
      desde: '',
      crecimiento_pct: '',
      churn_pct: '',
      nota: '',
    });
  const editarObjetivo = (fila: CatalogoObjetivo) =>
    setObjetivoDraft({
      id: fila.id,
      nivel: fila.nivel,
      entidad_id: fila.entidad_id,
      sucursal: fila.sucursal,
      etiqueta: fila.entidad,
      desde: fila.desde,
      crecimiento_pct: comoTexto(fila.crecimiento_pct),
      churn_pct: comoTexto(fila.churn_pct),
      nota: fila.nota,
      esBase: fila.nivel === 'general',
    });

  const nuevoObjetivoMes = (periodo = '') =>
    setObjetivoMesDraft({ periodo, crecimiento_pct: '', churn_pct: '', nota: '' });
  const editarObjetivoMes = (fila: CatalogoObjetivoMes) =>
    setObjetivoMesDraft({
      id: fila.id,
      periodo: fila.periodo,
      crecimiento_pct: comoTexto(fila.crecimiento_pct),
      churn_pct: comoTexto(fila.churn_pct),
      nota: fila.nota,
    });

  const editarSemaforo = (semaforo: SemaforoObjetivos) => setSemaforoDraft({ ...semaforo });

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

  const guardar = async (tipo: CatalogoTipo, payload: CatalogoPayload) => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const respuesta = await catalogosApi.guardar(tipo, payload);
      cerrarFormularios();
      setAviso(respuesta?.message ?? null);
      router.reload();
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
  const ignorar = (area: AreaCatalogo, nombre: string) => guardar('ignorados', { nombre, nota: '', area });

  /**
   * Registra de una vez varios nombres pendientes de ventas con el mismo rol y equipo.
   *
   * Cada persona sale de `membresiaDesde`, la misma sugerencia que rellena el
   * formulario suelto: sin revisarla una a una, el nombre y el apellido son
   * una suposición que se corrige después en Catálogos › Ventas. El medio (y
   * el usuario de Odoo) es el literal del export, que es lo que cuenta para el
   * cruce. Lo que no entra se enumera con su motivo; lo demás queda guardado.
   * Los roles que piden más (site, unidades) no se registran en bloque.
   */
  const registrarPersonas = async (literales: string[], rol: RolVentas, equipoId: number, equipo: string) => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const respuesta = await catalogosApi.guardarLote(
        'membresias',
        literales.map((literal) => ({ ...membresiaDesde(literal, rol, equipoId, equipo) })),
      );
      if (respuesta.errores.length) {
        const MOSTRADOS = 5;
        const detalle = respuesta.errores
          .slice(0, MOSTRADOS)
          .map((e) => `${e.nombre}: ${e.message}`)
          .join(' · ');
        const resto = respuesta.errores.length - MOSTRADOS;
        setError(`${respuesta.message} No entraron: ${detalle}${resto > 0 ? ` · y ${resto} más` : ''}`);
      } else {
        setAviso(respuesta.message);
      }
      if (respuesta.registrados.length) router.reload();
      return respuesta.registrados.length;
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
    persona: CatalogoPersonaVentas,
    literal: string,
    columnas: ('alias_medio' | 'alias_supervisor' | 'alias_usuario')[],
  ) =>
    guardar('personas', {
      id: persona.id,
      nombre: persona.nombre,
      apellido: persona.apellido,
      ...Object.fromEntries(columnas.map((c) => [c, [...persona[c], literal]])),
    });

  const confirmarBorrado = async () => {
    if (!borrando) return;
    setGuardando(true);
    setError(null);
    try {
      await catalogosApi.eliminar(borrando.tipo, borrando.id);
      setBorrando(null);
      router.reload();
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
