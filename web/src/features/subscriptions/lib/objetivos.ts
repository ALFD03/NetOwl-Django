/**
 * Objetivos comerciales: qué meta tiene cada fila y de qué color se pinta.
 *
 * Los objetivos no alteran ningún análisis, solo la meta y el cumplimiento; el
 * color lo pone el semáforo, con umbrales fijos. Por eso se aplican aquí, al
 * pintar, y no se guardan con las métricas: cambiar un objetivo en el catálogo
 * se ve al recargar, sin relanzar ningún mes. El servidor solo los sirve
 * (`services/subscriptions/analytics/objetivos.py`).
 *
 * **Manda el nivel más alto que tenga objetivo.** De más alto a más bajo:
 * estado → site → coordinador → zona, y el general del mes cuando ninguno
 * tiene. El objetivo de una zona solo rige si ni su coordinador, ni su site, ni
 * su estado fijan uno: con la zona al 10% y su coordinador al 15%, la zona
 * cumple contra el 15%.
 *
 * Los totales **ignoran los niveles por debajo del grupo**:
 * - El total de un coordinador mira coordinador, site y estado: la excepción
 *   de una de sus zonas no lo mueve.
 * - El total de un site mira site y estado: ni el coordinador ni la zona lo
 *   mueven, porque un site reparte sus zonas entre varios coordinadores.
 * - Los totales globales (Analytics, Results, Dashboard, consolidado FTTH y
 *   bloque RF) usan el general del mes.
 *
 * Un grupo no tiene una tasa: tiene una meta, que es la suma de la meta de cada
 * zona resuelta desde el nivel del grupo. Si el grupo tiene objetivo propio (y
 * nada por encima lo anula), esa suma es exactamente su base × su tasa; si no,
 * cada zona aporta la de su site o su estado, y el grupo nunca contradice a sus
 * partes.
 */

import type { MetricColor } from '@/shared/ui/theme/types';
import { toNumber } from '@/shared/utils/formatters/number';

import type {
  ObjetivosConfig, SemaforoObjetivos, TramoObjetivo,
} from '../types';
import type { ZonaConfig } from './dayReports';

/** Un objetivo ya resuelto, en porcentaje. */
export interface Objetivo {
  crecimiento: number;
  churn: number;
}

/** La meta de una fila o de un grupo de filas. */
export interface Meta {
  /** Tasa de crecimiento efectiva (%): meta / base, ponderada si es un grupo. */
  crecimientoPct: number;
  /** Churn máximo efectivo (%), ponderado igual. */
  churnPct: number;
  /** Altas netas que hacen falta para cumplir: la meta absoluta de crecimiento. */
  metaCrecimiento: number;
}

/** Nivel desde el que se empieza a resolver: el de la fila o el del grupo. */
export type NivelObjetivo = 'zona' | 'coordinador' | 'site' | 'estado' | 'general';

type Metrica = keyof Objetivo;
type NivelEntidad = Exclude<NivelObjetivo, 'general'>;

/** De más bajo a más alto; `general` va aparte porque no es una entidad. */
const CADENA: readonly NivelEntidad[] = ['zona', 'coordinador', 'site', 'estado'];

/** De dónde sale un objetivo resuelto: el nivel que lo fija y su nombre. */
export interface OrigenObjetivo {
  nivel: NivelObjetivo;
  /** Nombre de la zona, coordinador, site o estado; vacío en el general. */
  nombre: string;
  valor: number;
}

/**
 * Los valores que la aplicación tuvo escritos a mano. Solo responden si faltan
 * los props (una página que no los recibe, o un entorno sin migrar).
 */
export const OBJETIVOS_POR_DEFECTO: ObjetivosConfig = {
  general: { crecimiento: 6, churn: 3 },
  meses: {},
  estados: {},
  sites: {},
  coordinadores: {},
  zonas: {},
  semaforo: {
    cumpl_verde: 100,
    cumpl_amarillo: 60,
    crec_verde: 4,
    crec_amarillo: 0,
    churn_verde: 3,
    churn_amarillo: 4,
  },
};

/** `"2026-08-01 al 2026-08-31"` (o `"2026-08"`) → `"2026-08"`. */
export const mesDe = (periodo: string): string => String(periodo ?? '').slice(0, 7);

/**
 * El valor de `metrica` vigente en `mes` según una lista de tramos.
 *
 * Gana el tramo más reciente que haya empezado y que fije esa métrica: un tramo
 * que solo cambia el churn desde agosto no borra el crecimiento que la misma
 * entidad tenía antes. Nulo si ningún tramo lo fija.
 */
export function valorVigente(
  tramos: readonly TramoObjetivo[] | undefined,
  mes: string,
  metrica: Metrica,
): number | null {
  let mejor: TramoObjetivo | undefined;
  for (const tramo of tramos ?? []) {
    if (tramo[metrica] === null || tramo[metrica] === undefined) continue;
    if (tramo.desde !== null && tramo.desde > mes) continue;
    if (!mejor || (mejor.desde ?? '') <= (tramo.desde ?? '')) mejor = tramo;
  }
  return mejor ? (mejor[metrica] as number) : null;
}

/** El objetivo general de un periodo: su excepción de mes, o el general. */
export function objetivoGeneral(cfg: ObjetivosConfig, periodo: string): Objetivo {
  const excepcion = cfg.meses[mesDe(periodo)];
  const resolver = (metrica: Metrica): number =>
    excepcion?.[metrica] ?? cfg.general?.[metrica] ?? OBJETIVOS_POR_DEFECTO.general[metrica];
  return { crecimiento: resolver('crecimiento'), churn: resolver('churn') };
}

/** Dónde está una zona: su nombre y los de sus niveles superiores. */
interface Ubicacion {
  zona?: string;
  coordinador?: string;
  site?: string;
  estado?: string;
}

const clave = (nombre: string | undefined): string => String(nombre ?? '').trim().toLowerCase();

/** Tramos por nombre en minúsculas: los nodos traen el nombre tal y como lo escribe el export. */
function indexar(tabla: Record<string, TramoObjetivo[]>): Map<string, TramoObjetivo[]> {
  return new Map(Object.entries(tabla ?? {}).map(([nombre, tramos]) => [clave(nombre), tramos]));
}

export interface ResolverObjetivos {
  semaforo: SemaforoObjetivos;
  /** El objetivo general del periodo (excepción del mes o tramo vigente). */
  general: (periodo: string) => Objetivo;
  /**
   * El objetivo de una zona. Solo cuentan `desde` y los niveles por encima, y
   * entre ellos manda el más alto que tenga objetivo.
   */
  zona: (periodo: string, zona: string | undefined, desde?: NivelObjetivo) => Objetivo;
  /** Qué nivel fija una métrica de una zona: para explicar por qué rige lo que rige. */
  origen: (
    periodo: string,
    zona: string | undefined,
    metrica: Metrica,
    desde?: NivelObjetivo,
  ) => OrigenObjetivo;
  /** La meta de un conjunto de nodos, cada uno resuelto desde `desde`. */
  meta: (
    periodo: string,
    nodos: readonly { zona?: string; activos_inicio?: number }[],
    desde: NivelObjetivo,
  ) => Meta;
}

/**
 * Prepara la resolución de objetivos para una página.
 *
 * `zonas` es el catálogo que ya viaja como `zonasConfig`: es lo que dice a qué
 * coordinador, site y estado pertenece cada zona. Sin él (páginas que solo
 * pintan totales globales) todo cae en el general.
 */
export function crearResolver(
  cfg: ObjetivosConfig = OBJETIVOS_POR_DEFECTO,
  zonas: readonly ZonaConfig[] = [],
): ResolverObjetivos {
  const tablas: Record<NivelEntidad, Map<string, TramoObjetivo[]>> = {
    zona: indexar(cfg.zonas),
    coordinador: indexar(cfg.coordinadores),
    site: indexar(cfg.sites),
    estado: indexar(cfg.estados),
  };
  const ubicaciones = new Map<string, Ubicacion>(
    zonas.map((z) => [
      clave(z.name),
      { zona: z.name, coordinador: z.coordinador || undefined, site: z.site, estado: z.estado || undefined },
    ]),
  );

  const general = (periodo: string) => objetivoGeneral(cfg, periodo);

  const origen: ResolverObjetivos['origen'] = (periodo, nombre, metrica, desde = 'zona') => {
    const base: OrigenObjetivo = { nivel: 'general', nombre: '', valor: general(periodo)[metrica] };
    if (desde === 'general') return base;

    const mes = mesDe(periodo);
    // Una zona fuera del catálogo solo puede tener objetivo propio por nombre.
    const ubicacion = ubicaciones.get(clave(nombre)) ?? { zona: nombre };
    // Los niveles desde `desde` hacia arriba, recorridos del más alto al más
    // bajo: el primero que fije la métrica es el que manda.
    const niveles = CADENA.slice(CADENA.indexOf(desde)).reverse();

    for (const nivel of niveles) {
      const nombreNivel = ubicacion[nivel];
      if (!nombreNivel) continue;
      const valor = valorVigente(tablas[nivel].get(clave(nombreNivel)), mes, metrica);
      if (valor !== null) return { nivel, nombre: nombreNivel, valor };
    }
    return base;
  };

  const zona = (periodo: string, nombre: string | undefined, desde: NivelObjetivo = 'zona'): Objetivo => ({
    crecimiento: origen(periodo, nombre, 'crecimiento', desde).valor,
    churn: origen(periodo, nombre, 'churn', desde).valor,
  });

  const meta: ResolverObjetivos['meta'] = (periodo, nodos, desde) => {
    let base = 0;
    let metaCrecimiento = 0;
    let bajasPermitidas = 0;
    for (const nodo of nodos) {
      const inicio = Number(nodo.activos_inicio ?? 0);
      const objetivo = zona(periodo, nodo.zona, desde);
      base += inicio;
      metaCrecimiento += (inicio * objetivo.crecimiento) / 100;
      bajasPermitidas += (inicio * objetivo.churn) / 100;
    }
    // Sin base no hay ponderación posible: se informa el objetivo del nivel
    // tal cual, para que el rótulo no diga 0%.
    if (base <= 0) {
      const objetivo = nodos.length === 1 ? zona(periodo, nodos[0]?.zona, desde) : general(periodo);
      return { crecimientoPct: objetivo.crecimiento, churnPct: objetivo.churn, metaCrecimiento: 0 };
    }
    return {
      crecimientoPct: (metaCrecimiento / base) * 100,
      churnPct: (bajasPermitidas / base) * 100,
      metaCrecimiento,
    };
  };

  return { semaforo: cfg.semaforo ?? OBJETIVOS_POR_DEFECTO.semaforo, general, zona, origen, meta };
}

/** La meta de una base con un objetivo global (sin reparto por zonas). */
export function metaDeBase(activosInicio: number, objetivo: Objetivo): Meta {
  return {
    crecimientoPct: objetivo.crecimiento,
    churnPct: objetivo.churn,
    metaCrecimiento: (Number(activosInicio || 0) * objetivo.crecimiento) / 100,
  };
}

/** Las tres metas de un periodo y su cumplimiento, contra el objetivo del mes. */
export interface CumplimientoPeriodo {
  metaIngresos: number;
  metaVentas: number;
  metaCierre: number;
  cumplimientoIngresos: number;
  cumplimientoVentas: number;
  cumplimientoCierre: number;
}

/**
 * Metas y cumplimiento de un cierre (Analytics, Results).
 *
 * Ingresos (adiciones brutas) y ventas (nuevos) se miden contra la misma meta:
 * la base inicial por el objetivo de crecimiento. El cierre, contra la base
 * inicial más esa meta. Sin base, el cumplimiento es 0 y no `Infinity`.
 */
export function cumplimientoDelPeriodo(
  periodo: { activos_inicio?: number; activos_final?: number; adiciones_brutas?: number; nuevos_mes?: number },
  objetivo: Objetivo,
): CumplimientoPeriodo {
  const inicio = Number(periodo.activos_inicio || 0);
  const metaIngresos = (inicio * objetivo.crecimiento) / 100;
  const metaVentas = metaIngresos;
  const metaCierre = inicio + metaIngresos;
  const ratio = (valor: number | undefined, meta: number) => (meta > 0 ? (Number(valor || 0) / meta) * 100 : 0);
  return {
    metaIngresos,
    metaVentas,
    metaCierre,
    cumplimientoIngresos: ratio(periodo.adiciones_brutas, metaIngresos),
    cumplimientoVentas: ratio(periodo.nuevos_mes, metaVentas),
    cumplimientoCierre: ratio(periodo.activos_final, metaCierre),
  };
}

// --- Semáforo ---------------------------------------------------------------
//
// Umbrales fijos, iguales para todo el módulo: no dependen del objetivo de la
// fila. Así el mismo churn se pinta igual en Analytics, Results y los reportes.

export type Tono = Extract<MetricColor, 'green' | 'yellow' | 'red'>;

/** Cumplimiento (% de la meta): verde desde `cumpl_verde`, amarillo desde `cumpl_amarillo`. */
export function tonoCumplimiento(cumplimiento: number, s: SemaforoObjetivos): Tono {
  if (cumplimiento >= s.cumpl_verde) return 'green';
  if (cumplimiento >= s.cumpl_amarillo) return 'yellow';
  return 'red';
}

/** Crecimiento (%), más es mejor: verde desde `crec_verde`, amarillo desde `crec_amarillo`. */
export function tonoCrecimiento(crecimiento: number, s: SemaforoObjetivos): Tono {
  if (crecimiento >= s.crec_verde) return 'green';
  if (crecimiento >= s.crec_amarillo) return 'yellow';
  return 'red';
}

/** Churn (%), menos es mejor: verde hasta `churn_verde`, amarillo hasta `churn_amarillo`. */
export function tonoChurn(churn: number, s: SemaforoObjetivos): Tono {
  if (churn <= s.churn_verde) return 'green';
  if (churn <= s.churn_amarillo) return 'yellow';
  return 'red';
}

/** Clase de texto de Tailwind para un tono. */
export const TEXTO_TONO: Record<Tono, string> = {
  green: 'text-emerald-400',
  yellow: 'text-amber-400',
  red: 'text-rose-400',
};

/** Clase de fondo de Tailwind para la barra de progreso de un tono. */
export const BARRA_TONO: Record<Tono, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-rose-400',
};

/** `6` → `"6%"`, `6.5` → `"6.5%"`: el objetivo tal y como se escribe en un rótulo. */
export const formatObjetivo = (valor: number): string =>
  `${toNumber(valor).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
