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
  growth: number;
  churn: number;
}

/** La meta de una fila o de un grupo de filas. */
export interface Goal {
  /** Tasa de crecimiento efectiva (%): meta / base, ponderada si es un grupo. */
  growthPct: number;
  /** Churn máximo efectivo (%), ponderado igual. */
  churnPct: number;
  /** Altas netas que hacen falta para cumplir: la meta absoluta de crecimiento. */
  growthGoal: number;
  /** Cuántas zonas (nodos) del conjunto se dejaron fuera por no tener objetivo. */
  zonesWithoutTarget?: number;
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

type Metric = keyof TargetSpec;
type EntityLevel = Exclude<TargetLevel, 'general'>;

/**
 * De más bajo a más alto; `general` va aparte porque no es una entidad. La
 * sucursal está arriba del todo: su objetivo manda sobre toda la geografía.
 */
const CHAIN: readonly EntityLevel[] = ['zona_sucursal', 'zona', 'coordinador', 'site', 'estado', 'sucursal'];

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
  level: TargetLevel;
  /** Nombre de la zona, coordinador, site o estado; vacío en el general. */
  name: string;
  value: number;
}

/**
 * Los valores que la aplicación tuvo escritos a mano. Solo responden si faltan
 * los props (una página que no los recibe, o un entorno sin migrar).
 */
export const DEFAULT_TARGETS: TargetsConfig = {
  general: { growth: 6, churn: 3 },
  months: {},
  states: {},
  sites: {},
  coordinators: {},
  zones: {},
  branches: {},
  zone_branches: {},
  zones_without_target: {},
  thresholds: {
    compliance_green: 100,
    compliance_yellow: 60,
    growth_green: 4,
    growth_yellow: 0,
    churn_green: 3,
    churn_yellow: 4,
  },
};

/** `"2026-08-01 al 2026-08-31"` (o `"2026-08"`) → `"2026-08"`. */
export const monthOf = (period: string): string => String(period ?? '').slice(0, 7);

/**
 * El valor de `metrica` vigente en `mes` según una lista de tramos.
 *
 * Gana el tramo más reciente que haya empezado y que fije esa métrica: un tramo
 * que solo cambia el churn desde agosto no borra el crecimiento que la misma
 * entidad tenía antes. Nulo si ningún tramo lo fija.
 */
export function currentValue(
  tiers: readonly TargetTier[] | undefined,
  month: string,
  metric: Metric,
): number | null {
  let best: TargetTier | undefined;
  for (const tier of tiers ?? []) {
    if (tier[metric] === null || tier[metric] === undefined) continue;
    if (tier.since !== null && tier.since > month) continue;
    if (!best || (best.since ?? '') <= (tier.since ?? '')) best = tier;
  }
  return best ? (best[metric] as number) : null;
}

/** El objetivo general de un periodo: su excepción de mes, o el general. */
export function overallTarget(cfg: TargetsConfig, period: string): TargetSpec {
  const exception = cfg.months[monthOf(period)];
  const resolve = (metric: Metric): number =>
    exception?.[metric] ?? cfg.general?.[metric] ?? DEFAULT_TARGETS.general[metric];
  return { growth: resolve('growth'), churn: resolve('churn') };
}

/** Dónde está un nodo: el nombre que tiene en cada nivel de la cadena. */
type Location = Partial<Record<EntityLevel, string>>;

const key = (name: string | undefined): string => String(name ?? '').trim().toLowerCase();

/** Tramos por nombre en minúsculas: los nodos traen el nombre tal y como lo escribe el export. */
function indexBy(table: Record<string, TargetTier[]>): Map<string, TargetTier[]> {
  return new Map(Object.entries(table ?? {}).map(([name, tiers]) => [key(name), tiers]));
}

export interface TargetsResolver {
  thresholds: TargetsTrafficLight;
  /** El objetivo general del periodo (excepción del mes o tramo vigente). */
  general: (period: string) => TargetSpec;
  /**
   * El objetivo de un nodo (o de una zona, si se pasa solo su nombre). Solo
   * cuentan `desde` y los niveles por encima, y entre ellos manda el más alto
   * que tenga objetivo.
   */
  zone: (period: string, node: TargetNode | string | undefined, since?: TargetLevel) => TargetSpec;
  /** Qué nivel fija una métrica de un nodo: para explicar por qué rige lo que rige. */
  source: (
    period: string,
    node: TargetNode | string | undefined,
    metric: Metric,
    since?: TargetLevel,
  ) => TargetSource;
  /** Si el nodo está apartado del cumplimiento en ese periodo (zona sin objetivo). */
  withoutTarget: (period: string, node: TargetNode | string | undefined) => boolean;
  /**
   * La meta de un conjunto de nodos, cada uno resuelto desde `desde`. Los que
   * están sin objetivo no aportan meta y se cuentan en `zonesWithoutTarget`.
   */
  goal: (
    period: string,
    nodes: readonly (TargetNode & { active_start?: number })[],
    since: TargetLevel,
  ) => Goal;
}

/**
 * Prepara la resolución de objetivos para una página.
 *
 * `zones` es el catálogo que ya viaja como `zonesConfig`: es lo que dice a qué
 * coordinador, site y estado pertenece cada zona. Sin él (páginas que solo
 * pintan totales globales) todo cae en el general.
 */
export function createResolver(
  cfg: TargetsConfig = DEFAULT_TARGETS,
  zones: readonly ZoneConfig[] = [],
): TargetsResolver {
  const tables: Record<EntityLevel, Map<string, TargetTier[]>> = {
    zona_sucursal: indexBy(cfg.zone_branches),
    zona: indexBy(cfg.zones),
    coordinador: indexBy(cfg.coordinators),
    site: indexBy(cfg.sites),
    estado: indexBy(cfg.states),
    sucursal: indexBy(cfg.branches),
  };
  const catalogZones = new Map<string, Location>(
    zones.map((z) => [
      key(z.name),
      { zona: z.name, coordinador: z.coordinator || undefined, site: z.site, estado: z.state || undefined },
    ]),
  );

  /**
   * El nombre del nodo en cada nivel. La zona fuera del catálogo solo puede
   * tener objetivo propio, de nodo o de sucursal: no se sabe de quién cuelga.
   */
  const locate = (node: TargetNode | string | undefined): Location => {
    const { zona: zone, sucursal: branch } = typeof node === 'string' ? { zona: node, sucursal: undefined } : (node ?? {});
    const location: Location = { ...(catalogZones.get(key(zone)) ?? { zona: zone }) };
    if (branch) {
      location.sucursal = branch;
      if (zone) location.zona_sucursal = `${zone} - ${branch}`;
    }
    return location;
  };

  const general = (period: string) => overallTarget(cfg, period);

  const setAside = new Map(Object.entries(cfg.zones_without_target ?? {}).map(([name, t]) => [key(name), t]));
  const withoutTarget: TargetsResolver['withoutTarget'] = (period, node) => {
    const zone = typeof node === 'string' ? node : node?.zona;
    const tier = setAside.get(key(zone));
    if (!tier) return false;
    const month = monthOf(period);
    return (!tier.since || tier.since <= month) && (!tier.until || month <= tier.until);
  };

  const source: TargetsResolver['source'] = (period, node, metric, since = 'zona_sucursal') => {
    const base: TargetSource = { level: 'general', name: '', value: general(period)[metric] };
    if (since === 'general') return base;

    const month = monthOf(period);
    const location = locate(node);
    // Los niveles desde `desde` hacia arriba, recorridos del más alto al más
    // bajo: el primero que fije la métrica es el que manda.
    const levels = CHAIN.slice(CHAIN.indexOf(since)).reverse();

    for (const level of levels) {
      const levelName = location[level];
      if (!levelName) continue;
      const value = currentValue(tables[level].get(key(levelName)), month, metric);
      if (value !== null) return { level, name: levelName, value };
    }
    return base;
  };

  const zoneTarget: TargetsResolver['zone'] = (period, node, since = 'zona_sucursal') => ({
    growth: source(period, node, 'growth', since).value,
    churn: source(period, node, 'churn', since).value,
  });

  const goal: TargetsResolver['goal'] = (period, nodes, since) => {
    let base = 0;
    let growthGoal = 0;
    let churnAllowed = 0;
    let setAsideCount = 0;
    for (const node of nodes) {
      const start = Number(node.active_start ?? 0);
      if (withoutTarget(period, node)) {
        setAsideCount += 1;
        continue;
      }
      const target = zoneTarget(period, node, since);
      base += start;
      growthGoal += (start * target.growth) / 100;
      churnAllowed += (start * target.churn) / 100;
    }
    const extra = {
      ...(setAsideCount > 0 ? { zonesWithoutTarget: setAsideCount } : {}),
      ...(setAsideCount > 0 && setAsideCount === nodes.length ? { withoutTarget: true } : {}),
    };
    // Sin base no hay ponderación posible: se informa el objetivo del nivel
    // tal cual, para que el rótulo no diga 0%.
    if (base <= 0) {
      const target = nodes.length === 1 ? zoneTarget(period, nodes[0], since) : general(period);
      return { growthPct: target.growth, churnPct: target.churn, growthGoal: 0, ...extra };
    }
    return {
      growthPct: (growthGoal / base) * 100,
      churnPct: (churnAllowed / base) * 100,
      growthGoal,
      ...extra,
    };
  };

  return { thresholds: cfg.thresholds ?? DEFAULT_TARGETS.thresholds, general, zone: zoneTarget, source, withoutTarget, goal };
}

/**
 * Los nodos que cuentan para el resumen de un grupo: los que tienen objetivo.
 *
 * Las zonas sin objetivo siguen en la tabla del grupo, pero sus cifras no
 * entran en sus totales. Si todas están sin objetivo, ninguno.
 */
export function measuredNodes<T extends TargetNode>(
  resolve: TargetsResolver,
  period: string,
  nodes: readonly T[],
): T[] {
  return nodes.filter((node) => !resolve.withoutTarget(period, node));
}

/** La meta de una base con un objetivo global (sin reparto por zonas). */
export function baseGoal(startActive: number, target: TargetSpec): Goal {
  return {
    growthPct: target.growth,
    churnPct: target.churn,
    growthGoal: (Number(startActive || 0) * target.growth) / 100,
  };
}

/** Las tres metas de un periodo y su cumplimiento, contra el objetivo del mes. */
export interface PeriodCompliance {
  inflowsGoal: number;
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
  period: { active_start?: number; active_end?: number; gross_adds?: number; new_in_month?: number },
  target: TargetSpec,
): PeriodCompliance {
  const start = Number(period.active_start || 0);
  const inflowsGoal = (start * target.growth) / 100;
  const salesGoal = inflowsGoal;
  const closeGoal = start + inflowsGoal;
  const ratio = (value: number | undefined, goal: number) => (goal > 0 ? (Number(value || 0) / goal) * 100 : 0);
  return {
    inflowsGoal,
    salesGoal,
    closeGoal,
    revenueCompliance: ratio(period.gross_adds, inflowsGoal),
    salesCompliance: ratio(period.new_in_month, salesGoal),
    closeCompliance: ratio(period.active_end, closeGoal),
  };
}

// --- Semáforo ---------------------------------------------------------------
//
// Umbrales fijos, iguales para todo el módulo: no dependen del objetivo de la
// fila. Así el mismo churn se pinta igual en Analytics, Results y los reportes.

export type Tone = Extract<MetricColor, 'green' | 'yellow' | 'red'>;

/** Cumplimiento (% de la meta): verde desde `cumpl_verde`, amarillo desde `cumpl_amarillo`. */
export function complianceTone(compliance: number, s: TargetsTrafficLight): Tone {
  if (compliance >= s.compliance_green) return 'green';
  if (compliance >= s.compliance_yellow) return 'yellow';
  return 'red';
}

/** Crecimiento (%), más es mejor: verde desde `crec_verde`, amarillo desde `crec_amarillo`. */
export function growthTone(growth: number, s: TargetsTrafficLight): Tone {
  if (growth >= s.growth_green) return 'green';
  if (growth >= s.growth_yellow) return 'yellow';
  return 'red';
}

/** Churn (%), menos es mejor: verde hasta `churn_verde`, amarillo hasta `churn_amarillo`. */
export function churnTone(churn: number, s: TargetsTrafficLight): Tone {
  if (churn <= s.churn_green) return 'green';
  if (churn <= s.churn_yellow) return 'yellow';
  return 'red';
}

/** Clase de texto de Tailwind para un tono. */
export const TONE_TEXT: Record<Tone, string> = {
  green: 'text-emerald-400',
  yellow: 'text-amber-400',
  red: 'text-rose-400',
};

/** Clase de fondo de Tailwind para la barra de progreso de un tono. */
export const TONE_BAR: Record<Tone, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-rose-400',
};

/** `6` → `"6%"`, `6.5` → `"6.5%"`: el objetivo tal y como se escribe en un rótulo. */
export const formatTarget = (value: number): string =>
  `${toNumber(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
