import { useState } from 'react';
import { router } from '@inertiajs/react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi, type CatalogoPayload } from '@/shared/lib/api/subscriptions';
import type {
  CatalogoNombrado,
  CatalogoPlan,
  CatalogoPlanRegulador,
  CatalogoProductoIgnorado,
  CatalogoSite,
  CatalogoTipo,
  CatalogoZona,
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
export type NombreDraft = { id?: number; nombre: string; tipo: 'estados' | 'coordinadores' };
export type IgnoradoDraft = { id?: number; nombre: string; nota: string };

export type CatalogoVista =
  | 'pendientes'
  | 'planes'
  | 'zonas'
  | 'sites'
  | 'estados'
  | 'coordinadores'
  | 'ignorados'
  | 'reguladores';

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
  sites: CatalogoSite[];
  estados: CatalogoNombrado[];
  /** Nombre que llega en `?nuevo_plan=`: abre el alta ya rellena. */
  nuevoPlan: string;
  /** Si administra la mitad comercial; sin ella se abre en la operacional. */
  comercial: boolean;
}

/**
 * Estado de la pantalla de catálogos.
 *
 * Cada catálogo tiene su propio borrador en lugar de uno genérico: los campos
 * de un plan y los de una zona no se parecen en nada, y un único objeto suelto
 * obligaría a comprobar en cada formulario qué trae dentro.
 *
 * Tras cada escritura se recarga la página en vez de retocar el estado local:
 * los listados dependen unos de otros (borrar un site cambia lo que puede
 * elegir una zona) y el servidor ya devuelve todo junto.
 */
export function useCatalogos({ sites, estados, nuevoPlan, comercial }: Args) {
  const [vista, setVista] = useState<CatalogoVista>(() => {
    if (!comercial) return 'zonas';
    return nuevoPlan ? 'planes' : 'pendientes';
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `?nuevo_plan=` viene del aviso de la importación y de la pestaña de planes
  // por clasificar del ETA: el formulario abre con el nombre ya escrito para no
  // obligar a copiarlo a mano. Estado inicial y no efecto: el valor llega con
  // la primera pintada y no vuelve a cambiar mientras la página viva.
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(
    () => (nuevoPlan ? { ...PLAN_VACIO, nombre: nuevoPlan } : null),
  );
  const [reguladorDraft, setReguladorDraft] = useState<ReguladorDraft | null>(null);
  const [zonaDraft, setZonaDraft] = useState<ZonaDraft | null>(null);
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [nombreDraft, setNombreDraft] = useState<NombreDraft | null>(null);
  const [ignoradoDraft, setIgnoradoDraft] = useState<IgnoradoDraft | null>(null);
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

  const nuevaZona = () =>
    setZonaDraft({
      nombre: '',
      site_id: sites[0]?.id ?? null,
      estado_id: estados[0]?.id ?? null,
      tecnologia: 'FTTH',
      coordinador_id: null,
    });
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

  const nuevoNombre = (tipo: NombreDraft['tipo']) => setNombreDraft({ nombre: '', tipo });
  const editarNombre = (tipo: NombreDraft['tipo'], fila: CatalogoNombrado) =>
    setNombreDraft({ id: fila.id, nombre: fila.nombre, tipo });

  const nuevoIgnorado = () => setIgnoradoDraft({ nombre: '', nota: '' });
  const editarIgnorado = (fila: CatalogoProductoIgnorado) =>
    setIgnoradoDraft({ id: fila.id, nombre: fila.nombre, nota: fila.nota });

  const cerrarFormularios = () => {
    setPlanDraft(null);
    setReguladorDraft(null);
    setZonaDraft(null);
    setSiteDraft(null);
    setNombreDraft(null);
    setIgnoradoDraft(null);
  };

  const guardar = async (tipo: CatalogoTipo, payload: CatalogoPayload) => {
    setGuardando(true);
    setError(null);
    try {
      await subscriptionsApi.saveCatalogo(tipo, payload);
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
   * Declara que un producto nunca será un plan.
   *
   * Es la otra respuesta posible ante un producto sin catalogar: la
   * comprobación no puede distinguir un plan nuevo de un router o una
   * instalación, así que la decisión la toma quien mira la lista.
   */
  const ignorarProducto = (nombre: string) => guardar('ignorados', { nombre, nota: '' });

  const confirmarBorrado = async () => {
    if (!borrando) return;
    setGuardando(true);
    setError(null);
    try {
      await subscriptionsApi.deleteCatalogo(borrando.tipo, borrando.id);
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
    zonaDraft, setZonaDraft, nuevaZona, editarZona,
    siteDraft, setSiteDraft, nuevoSite, editarSite,
    nombreDraft, setNombreDraft, nuevoNombre, editarNombre,
    ignoradoDraft, setIgnoradoDraft, nuevoIgnorado, editarIgnorado,
    borrando, setBorrando, confirmarBorrado,
    cerrarFormularios, guardar, ignorarProducto,
  };
}
