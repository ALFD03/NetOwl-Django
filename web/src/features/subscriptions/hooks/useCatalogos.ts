import { useState } from 'react';
import { router } from '@inertiajs/react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { catalogosApi, type CatalogoPayload } from '@/shared/lib/api/catalogos';
import type {
  AreaCatalogo,
  CargoVentas,
  CatalogoNombrado,
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
export type SiteDraft = { id?: number; nombre: string; orden: number };
export type NombreDraft = { id?: number; nombre: string; tipo: 'estados' };
export type PersonaDraft = Omit<CatalogoPersonaVentas, 'id' | 'unidades'> & { id?: number };
export type UnidadDraft = { id?: number; nombre: string; persona_id: number | null };
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

export type CatalogoVista =
  | CargoVentas
  | 'unidades'
  | 'pendientes'
  | 'planes'
  | 'zonas'
  | 'sites'
  | 'estados'
  | 'coordinadores'
  | 'ignorados'
  | 'reguladores'
  | 'objetivos';

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
  /** Literal y cargo de `?nueva_persona=&cargo=`: abre el alta de persona ya rellena. */
  nuevaPersona?: { literal: string; cargo: CargoVentas };
}

/**
 * Una persona en blanco del cargo indicado, rellena a partir del literal del
 * export si lo hay.
 *
 * El literal de `Vendedor` (coordinador de oficina) es el nombre completo con
 * `(User)`: va entero al usuario de Odoo, y de él se adivinan nombre, apellido
 * y medio —dos nombres y dos apellidos es lo habitual—. Los de `Medio` son ya
 * nombre + apellido y van al medio. Todo queda editable: es una sugerencia.
 */
export function personaDesde(literal: string, cargo: CargoVentas): PersonaDraft {
  const base = literal.replace(/\s*\(\s*users?\s*\)\s*$/i, '').trim();
  const partes = base.split(/\s+/).filter(Boolean);
  if (cargo === 'coord_oficina') {
    const corte = partes.length >= 4 ? 2 : 1;
    const nombre = partes.slice(0, corte).join(' ');
    const apellido = partes.slice(corte).join(' ');
    return {
      nombre,
      apellido,
      cargo,
      medio: [partes[0], partes[corte]].filter(Boolean).join(' '),
      usuario_odoo: literal ? `${base} (User)` : '',
    };
  }
  return {
    nombre: partes[0] ?? '',
    apellido: partes.slice(1).join(' '),
    cargo,
    medio: base,
    usuario_odoo: '',
  };
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
  vistaInicial, sites = [], estados = [], nuevoPlan = '', nuevaZona = '', nuevaPersona,
}: Args) {
  const [vista, setVista] = useState<CatalogoVista>(vistaInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [personaDraft, setPersonaDraft] = useState<PersonaDraft | null>(
    () => (nuevaPersona?.literal ? personaDesde(nuevaPersona.literal, nuevaPersona.cargo) : null),
  );
  const [unidadDraft, setUnidadDraft] = useState<UnidadDraft | null>(null);
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
  const editarZona = (zona: CatalogoZona) =>
    setZonaDraft({
      id: zona.id,
      nombre: zona.nombre,
      site_id: zona.site_id,
      estado_id: zona.estado_id,
      tecnologia: zona.tecnologia,
      coordinador_id: zona.coordinador_id,
    });

  const nuevoSite = () => setSiteDraft({ nombre: '', orden: 999 });
  const editarSite = (site: CatalogoSite) => setSiteDraft({ id: site.id, nombre: site.nombre, orden: site.orden });

  const nuevaPersonaVacia = (cargo: CargoVentas) => setPersonaDraft(personaDesde('', cargo));
  const editarPersona = (fila: CatalogoPersonaVentas) =>
    setPersonaDraft({
      id: fila.id,
      nombre: fila.nombre,
      apellido: fila.apellido,
      cargo: fila.cargo,
      medio: fila.medio,
      usuario_odoo: fila.usuario_odoo,
    });

  const nuevaUnidad = () => setUnidadDraft({ nombre: '', persona_id: null });
  const editarUnidad = (fila: CatalogoUnidadNegocio) =>
    setUnidadDraft({ id: fila.id, nombre: fila.nombre, persona_id: fila.persona_id });

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
    setUnidadDraft(null);
    setNombreDraft(null);
    setIgnoradoDraft(null);
    setObjetivoDraft(null);
    setObjetivoMesDraft(null);
    setSemaforoDraft(null);
  };

  const guardar = async (tipo: CatalogoTipo, payload: CatalogoPayload) => {
    setGuardando(true);
    setError(null);
    try {
      await catalogosApi.guardar(tipo, payload);
      cerrarFormularios();
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
    vista, setVista, guardando, error, setError,
    planDraft, setPlanDraft, nuevoPlanVacio, editarPlan, crearPlanDesde,
    reguladorDraft, setReguladorDraft, nuevoRegulador, editarRegulador,
    zonaDraft, setZonaDraft, nuevaZonaVacia, editarZona,
    siteDraft, setSiteDraft, nuevoSite, editarSite,
    personaDraft, setPersonaDraft, nuevaPersonaVacia, editarPersona,
    unidadDraft, setUnidadDraft, nuevaUnidad, editarUnidad,
    nombreDraft, setNombreDraft, nuevoNombre, editarNombre,
    ignoradoDraft, setIgnoradoDraft, nuevoIgnorado, editarIgnorado,
    objetivoDraft, setObjetivoDraft, nuevoObjetivo, editarObjetivo,
    objetivoMesDraft, setObjetivoMesDraft, nuevoObjetivoMes, editarObjetivoMes,
    semaforoDraft, setSemaforoDraft, editarSemaforo,
    borrando, setBorrando, confirmarBorrado,
    cerrarFormularios, guardar, ignorar,
  };
}
