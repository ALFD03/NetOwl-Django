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
 * sucursal → estado → site → coordinador → zona → zona-sucursal (el nodo), y el
 * general del mes cuando ninguno tiene. El objetivo de una zona solo rige si
 * nada por encima fija uno: con la zona al 10% y su coordinador al 15%, la zona
 * cumple contra el 15%. La sucursal manda sobre toda la geografía.
 *
 * Los totales **ignoran los niveles por debajo del grupo**:
 * - El total de un coordinador mira coordinador, site, estado y sucursal: la
 *   excepción de una de sus zonas o de uno de sus nodos no lo mueve.
 * - El total de un site mira site, estado y sucursal: ni el coordinador ni la
 *   zona lo mueven, porque un site reparte sus zonas entre varios coordinadores.
 * - Los totales globales (Analytics, Results, Dashboard, consolidado FTTH y
 *   bloque RF) usan el general del mes.
 *
 * Un grupo no tiene una tasa: tiene una meta, que es la suma de la meta de cada
 * zona resuelta desde el nivel del grupo. Si el grupo tiene objetivo propio (y
 * nada por encima lo anula), esa suma es exactamente su base × su tasa; si no,
 * cada zona aporta la de su site o su estado, y el grupo nunca contradice a sus
 * partes.
 *
 * **Una zona sin objetivo** (`zonas_sin_objetivo`, las nuevas) sale en la tabla
 * de su grupo pero **no entra en su resumen**: ni en la meta ni en la base, las
 * instalaciones, las bajas, el crecimiento o el churn del grupo. `meta` no le
 * suma meta y cuenta cuántas se apartaron; los hooks de los reportes suman los
 * totales sin ellas (`medidos`).
 */

import type { MetricColor } from '@/shared/ui/theme/types';
import { toNumber } from '@/shared/utils/formatters/number';

import type {
  TargetsConfig, TargetsTrafficLight, TargetTier,
} from '../types';
import type { ZoneConfig } from './dayReports';

/** Un objetivo ya resuelto, en porcentaje. */
export interface TargetSpec {
  crecimiento: number;
  churn: number;
}

/** La meta de una fila o de un grupo de filas. */
export interface Meta {
  /** Tasa de crecimiento efectiva (%): meta / base, ponderada si es un grupo. */
  growthPct: number;
  /** Churn máximo efectivo (%), ponderado igual. */
  churnPct: number;
  /** Altas netas que hacen falta para cumplir: la meta absoluta de crecimiento. */
  growthGoal: number;
  /** Cuántas zonas (nodos) del conjunto se dejaron fuera por no tener objetivo. */
  zonasSinObjetivo?: number;
  /** Todas las zonas del conjunto están sin objetivo: no hay contra qué medir. */
  withoutTarget?: boolean;
}

/** Nivel desde el que se empieza a resolver: el de la fila o el del grupo. */
export type TargetLevel =
  | 'zona_sucursal'
  | 'zona'
  | 'coordinador'
  | 'site'
  | 'estado'
  | 'sucursal'
  | 'general';

type Metrica = keyof TargetSpec;
type EntityLevel = Exclude<TargetLevel, 'general'>;

/**
 * De más bajo a más alto; `general` va aparte porque no es una entidad. La
 * sucursal está arriba del todo: su objetivo manda sobre toda la geografía.
 */
const CADENA: readonly EntityLevel[] = ['zona_sucursal', 'zona', 'coordinador', 'site', 'estado', 'sucursal'];

/**
 * Un nodo de los reportes: su zona y su sucursal. Los niveles `zona_sucursal`
 * y `sucursal` necesitan la segunda; el resto se deduce de la zona.
 */
export interface TargetNode {
  zona?: string;
  sucursal?: string;
}


/** De dónde sale un objetivo resuelto: el nivel que lo fija y su nombre. */
export interface TargetSource {
  nivel: TargetLevel;
  /** Nombre de la zona, coordinador, site o estado; vacío en el general. */
  nombre: string;
  valor: number;
}

/**
 * Los valores que la aplicación tuvo escritos a mano. Solo responden si faltan
 * los props (una página que no los recibe, o un entorno sin migrar).
 */
export const DEFAULT_TARGETS: TargetsConfig = {
  general: { crecimiento: 6, churn: 3 },
  meses: {},
  estados: {},
  sites: {},
  coordinadores: {},
  zonas: {},
  sucursales: {},
  zonas_sucursal: {},
  zonas_sin_objetivo: {},
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
export const monthOf = (periodo: string): string => String(periodo ?? '').slice(0, 7);

/**
 * El valor de `metrica` vigente en `mes` según una lista de tramos.
 *
 * Gana el tramo más reciente que haya empezado y que fije esa métrica: un tramo
 * que solo cambia el churn desde agosto no borra el crecimiento que la misma
 * entidad tenía antes. Nulo si ningún tramo lo fija.
 */
export function currentValue(
  tramos: readonly TargetTier[] | undefined,
  mes: string,
  metrica: Metrica,
): number | null {
  let mejor: TargetTier | undefined;
  for (const tramo of tramos ?? []) {
    if (tramo[metrica] === null || tramo[metrica] === undefined) continue;
    if (tramo.desde !== null && tramo.desde > mes) continue;
    if (!mejor || (mejor.desde ?? '') <= (tramo.desde ?? '')) mejor = tramo;
  }
  return mejor ? (mejor[metrica] as number) : null;
}

/** El objetivo general de un periodo: su excepción de mes, o el general. */
export function overallTarget(cfg: TargetsConfig, periodo: string): TargetSpec {
  const excepcion = cfg.meses[monthOf(periodo)];
  const resolve = (metrica: Metrica): number =>
    excepcion?.[metrica] ?? cfg.general?.[metrica] ?? DEFAULT_TARGETS.general[metrica];
  return { crecimiento: resolve('crecimiento'), churn: resolve('churn') };
}

/** Dónde está un nodo: el nombre que tiene en cada nivel de la cadena. */
type Ubicacion = Partial<Record<EntityLevel, string>>;

const clave = (nombre: string | undefined): string => String(nombre ?? '').trim().toLowerCase();

/** Tramos por nombre en minúsculas: los nodos traen el nombre tal y como lo escribe el export. */
function indexar(table: Record<string, TargetTier[]>): Map<string, TargetTier[]> {
  return new Map(Object.entries(table ?? {}).map(([nombre, tramos]) => [clave(nombre), tramos]));
}

export interface TargetsResolver {
  semaforo: TargetsTrafficLight;
  /** El objetivo general del periodo (excepción del mes o tramo vigente). */
  general: (periodo: string) => TargetSpec;
  /**
   * El objetivo de un nodo (o de una zona, si se pasa solo su nombre). Solo
   * cuentan `desde` y los niveles por encima, y entre ellos manda el más alto
   * que tenga objetivo.
   */
  zona: (periodo: string, nodo: TargetNode | string | undefined, desde?: TargetLevel) => TargetSpec;
  /** Qué nivel fija una métrica de un nodo: para explicar por qué rige lo que rige. */
  origen: (
    periodo: string,
    nodo: TargetNode | string | undefined,
    metrica: Metrica,
    desde?: TargetLevel,
  ) => TargetSource;
  /** Si el nodo está apartado del cumplimiento en ese periodo (zona sin objetivo). */
  withoutTarget: (periodo: string, nodo: TargetNode | string | undefined) => boolean;
  /**
   * La meta de un conjunto de nodos, cada uno resuelto desde `desde`. Los que
   * están sin objetivo no aportan meta y se cuentan en `zonasSinObjetivo`.
   */
  meta: (
    periodo: string,
    nodos: readonly (TargetNode & { activos_inicio?: number })[],
    desde: TargetLevel,
  ) => Meta;
}

/**
 * Prepara la resolución de objetivos para una página.
 *
 * `zonas` es el catálogo que ya viaja como `zonasConfig`: es lo que dice a qué
 * coordinador, site y estado pertenece cada zona. Sin él (páginas que solo
 * pintan totales globales) todo cae en el general.
 */
export function createResolver(
  cfg: TargetsConfig = DEFAULT_TARGETS,
  zonas: readonly ZoneConfig[] = [],
): TargetsResolver {
  const tablas: Record<EntityLevel, Map<string, TargetTier[]>> = {
    zona_sucursal: indexar(cfg.zonas_sucursal),
    zona: indexar(cfg.zonas),
    coordinador: indexar(cfg.coordinadores),
    site: indexar(cfg.sites),
    estado: indexar(cfg.estados),
    sucursal: indexar(cfg.sucursales),
  };
  const catalogZones = new Map<string, Ubicacion>(
    zonas.map((z) => [
      clave(z.name),
      { zona: z.name, coordinador: z.coordinador || undefined, site: z.site, estado: z.estado || undefined },
    ]),
  );

  /**
   * El nombre del nodo en cada nivel. La zona fuera del catálogo solo puede
   * tener objetivo propio, de nodo o de sucursal: no se sabe de quién cuelga.
   */
  const locate = (nodo: TargetNode | string | undefined): Ubicacion => {
    const { zona, sucursal } = typeof nodo === 'string' ? { zona: nodo, sucursal: undefined } : (nodo ?? {});
    const ubicacion: Ubicacion = { ...(catalogZones.get(clave(zona)) ?? { zona }) };
    if (sucursal) {
      ubicacion.sucursal = sucursal;
      if (zona) ubicacion.zona_sucursal = `${zona} - ${sucursal}`;
    }
    return ubicacion;
  };

  const general = (periodo: string) => overallTarget(cfg, periodo);

  const apartadas = new Map(Object.entries(cfg.zonas_sin_objetivo ?? {}).map(([nombre, t]) => [clave(nombre), t]));
  const sinObjetivo: TargetsResolver['withoutTarget'] = (periodo, nodo) => {
    const zona = typeof nodo === 'string' ? nodo : nodo?.zona;
    const tramo = apartadas.get(clave(zona));
    if (!tramo) return false;
    const mes = monthOf(periodo);
    return (!tramo.desde || tramo.desde <= mes) && (!tramo.hasta || mes <= tramo.hasta);
  };

  const origen: TargetsResolver['origen'] = (periodo, nodo, metrica, desde = 'zona_sucursal') => {
    const base: TargetSource = { nivel: 'general', nombre: '', valor: general(periodo)[metrica] };
    if (desde === 'general') return base;

    const mes = monthOf(periodo);
    const ubicacion = locate(nodo);
    // Los niveles desde `desde` hacia arriba, recorridos del más alto al más
    // bajo: el primero que fije la métrica es el que manda.
    const niveles = CADENA.slice(CADENA.indexOf(desde)).reverse();

    for (const nivel of niveles) {
      const levelName = ubicacion[nivel];
      if (!levelName) continue;
      const valor = currentValue(tablas[nivel].get(clave(levelName)), mes, metrica);
      if (valor !== null) return { nivel, nombre: levelName, valor };
    }
    return base;
  };

  const zona: TargetsResolver['zona'] = (periodo, nodo, desde = 'zona_sucursal') => ({
    crecimiento: origen(periodo, nodo, 'crecimiento', desde).valor,
    churn: origen(periodo, nodo, 'churn', desde).valor,
  });

  const meta: TargetsResolver['meta'] = (periodo, nodos, desde) => {
    let base = 0;
    let metaCrecimiento = 0;
    let churnAllowed = 0;
    let apartadas = 0;
    for (const nodo of nodos) {
      const inicio = Number(nodo.activos_inicio ?? 0);
      if (sinObjetivo(periodo, nodo)) {
        apartadas += 1;
        continue;
      }
      const objetivo = zona(periodo, nodo, desde);
      base += inicio;
      metaCrecimiento += (inicio * objetivo.crecimiento) / 100;
      churnAllowed += (inicio * objetivo.churn) / 100;
    }
    const extra = {
      ...(apartadas > 0 ? { zonasSinObjetivo: apartadas } : {}),
      ...(apartadas > 0 && apartadas === nodos.length ? { sinObjetivo: true } : {}),
    };
    // Sin base no hay ponderación posible: se informa el objetivo del nivel
    // tal cual, para que el rótulo no diga 0%.
    if (base <= 0) {
      const objetivo = nodos.length === 1 ? zona(periodo, nodos[0], desde) : general(periodo);
      return { growthPct: objetivo.crecimiento, churnPct: objetivo.churn, growthGoal: 0, ...extra };
    }
    return {
      growthPct: (metaCrecimiento / base) * 100,
      churnPct: (churnAllowed / base) * 100,
      growthGoal: metaCrecimiento,
      ...extra,
    };
  };

  return { semaforo: cfg.semaforo ?? DEFAULT_TARGETS.semaforo, general, zona, origen, withoutTarget: sinObjetivo, meta };
}

/**
 * Los nodos que cuentan para el resumen de un grupo: los que tienen objetivo.
 *
 * Las zonas sin objetivo siguen en la tabla del grupo, pero sus cifras no
 * entran en sus totales. Si todas están sin objetivo, ninguno.
 */
export function measuredNodes<T extends TargetNode>(
  resolve: TargetsResolver,
  periodo: string,
  nodos: readonly T[],
): T[] {
  return nodos.filter((nodo) => !resolve.withoutTarget(periodo, nodo));
}

/** La meta de una base con un objetivo global (sin reparto por zonas). */
export function baseGoal(activosInicio: number, objetivo: TargetSpec): Meta {
  return {
    growthPct: objetivo.crecimiento,
    churnPct: objetivo.churn,
    growthGoal: (Number(activosInicio || 0) * objetivo.crecimiento) / 100,
  };
}

/** Las tres metas de un periodo y su cumplimiento, contra el objetivo del mes. */
export interface PeriodCompliance {
  metaIngresos: number;
  salesGoal: number;
  closeGoal: number;
  revenueCompliance: number;
  salesCompliance: number;
  closeCompliance: number;
}

/**
 * Metas y cumplimiento de un cierre (Analytics, Results).
 *
 * Ingresos (adiciones brutas) y ventas (nuevos) se miden contra la misma meta:
 * la base inicial por el objetivo de crecimiento. El cierre, contra la base
 * inicial más esa meta. Sin base, el cumplimiento es 0 y no `Infinity`.
 */
export function periodCompliance(
  periodo: { activos_inicio?: number; activos_final?: number; adiciones_brutas?: number; nuevos_mes?: number },
  objetivo: TargetSpec,
): PeriodCompliance {
  const inicio = Number(periodo.activos_inicio || 0);
  const metaIngresos = (inicio * objetivo.crecimiento) / 100;
  const metaVentas = metaIngresos;
  const metaCierre = inicio + metaIngresos;
  const ratio = (valor: number | undefined, meta: number) => (meta > 0 ? (Number(valor || 0) / meta) * 100 : 0);
  return {
    metaIngresos,
    salesGoal: metaVentas,
    closeGoal: metaCierre,
    revenueCompliance: ratio(periodo.adiciones_brutas, metaIngresos),
    salesCompliance: ratio(periodo.nuevos_mes, metaVentas),
    closeCompliance: ratio(periodo.activos_final, metaCierre),
  };
}

// --- Semáforo ---------------------------------------------------------------
//
// Umbrales fijos, iguales para todo el módulo: no dependen del objetivo de la
// fila. Así el mismo churn se pinta igual en Analytics, Results y los reportes.

export type Tono = Extract<MetricColor, 'green' | 'yellow' | 'red'>;

/** Cumplimiento (% de la meta): verde desde `cumpl_verde`, amarillo desde `cumpl_amarillo`. */
export function complianceTone(cumplimiento: number, s: TargetsTrafficLight): Tono {
  if (cumplimiento >= s.cumpl_verde) return 'green';
  if (cumplimiento >= s.cumpl_amarillo) return 'yellow';
  return 'red';
}

/** Crecimiento (%), más es mejor: verde desde `crec_verde`, amarillo desde `crec_amarillo`. */
export function tonoCrecimiento(crecimiento: number, s: TargetsTrafficLight): Tono {
  if (crecimiento >= s.crec_verde) return 'green';
  if (crecimiento >= s.crec_amarillo) return 'yellow';
  return 'red';
}

/** Churn (%), menos es mejor: verde hasta `churn_verde`, amarillo hasta `churn_amarillo`. */
export function tonoChurn(churn: number, s: TargetsTrafficLight): Tono {
  if (churn <= s.churn_verde) return 'green';
  if (churn <= s.churn_amarillo) return 'yellow';
  return 'red';
}

/** Clase de texto de Tailwind para un tono. */
export const TONE_TEXT: Record<Tono, string> = {
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
export const formatTarget = (valor: number): string =>
  `${toNumber(valor).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
