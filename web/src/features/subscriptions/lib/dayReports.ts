/**
 * Reagrupa en cliente el corte de un día para los dos reportes comerciales.
 *
 * Es lo que permite que mover la barra de días no dispare ninguna petición: el
 * mes entero ya viajó en los props, y aquí se vuelve a agrupar por site,
 * tecnología y coordinador usando el catálogo de zonas.
 */

import type { DimensionVal } from '@/shared/types/domain';

import type { SalesReportSite, SalesReportNode } from '../hooks/useSalesReportData';
import type { BusinessUnitGroup, BusinessUnitNode } from '../hooks/useBusinessUnitsData';

/** Una zona del catalogo, tal y como la envia `get_zonas_config()`. */
export interface ZonaConfig {
  name: string;
  site: string;
  type: string;
  coordinador?: string;
  /** Para la herencia de objetivos (ver `lib/objetivos.ts`). */
  estado?: string;
}

export interface ZonasConfig {
  zonas: ZonaConfig[];
  /** Orden de presentacion de los sites; el backend es la unica fuente. */
  siteOrder: string[];
}

const SITE_DESCONOCIDO = 'Otros / Desconocido';
const TIPO_POR_DEFECTO = 'FTTH';
const GRUPO_RF = 'NODOS RADIOFRECUENCIA (RF)';

/**
 * Reagrupa el desglose `zona_sucursal` de un dia en las estructuras que
 * renderizan Ventas y Unidades de Negocio.
 *
 * El mes entero ya viaja en los props (`dayMetrics`), asi que cambiar de dia en
 * la barra de corte es esta reagrupacion en memoria y no una peticion nueva.
 *
 * Es el equivalente en cliente de `get_sales_report_data` /
 * `get_business_units_data` (`backend/subscriptions/subs_data_api.py`): si
 * cambia el criterio de agrupacion alli, hay que cambiarlo aqui. Los totales no
 * se replican: ambas vistas los recalculan con `aggregateNodes`.
 */

/** "Zona - Sucursal" -> sus dos partes, con el mismo fallback que el backend. */
const partirValor = (valor: string): { zona: string; sucursal: string } => {
  const parts = String(valor).split(' - ');
  return {
    zona: (parts[0] ?? valor).trim(),
    sucursal: parts.length > 1 ? (parts[1] ?? '').trim() : 'Sin Sucursal',
  };
};

const num = (value: number | undefined): number => Number(value ?? 0);

const nodoBase = (row: DimensionVal) => {
  const valor = String(row.valor ?? '');
  const { zona, sucursal } = partirValor(valor);
  return {
    zona_sucursal: valor,
    zona,
    sucursal,
    activos_inicio: num(row.activos_inicio),
    activos_final: num(row.activos_final),
    nuevos: num(row.nuevos),
    bajas: num(row.bajas),
    crecimiento: num(row.crecimiento),
    churn_neto_pct: num(row.churn_neto_pct),
    churn_bruto_pct: num(row.churn_bruto_pct),
    // El backend expone la reactivacion valida como `react_val`.
    reactivaciones: num(row.react_val),
    adiciones_netas: num(row.adiciones_netas),
    adiciones_brutas: num(row.adiciones_brutas),
    corte_impagado: num(row.corte_impagado),
  };
};

const porActivosFinal = <T extends { activos_final?: number }>(a: T, b: T): number =>
  num(b.activos_final) - num(a.activos_final);

/** Ventas: site -> tecnologia -> nodos. */
export function buildSalesSites(
  rows: DimensionVal[],
  config: ZonasConfig | undefined,
): SalesReportSite[] {
  if (!rows.length) return [];

  const zoneInfo = new Map<string, { site: string; type: string }>();
  config?.zonas.forEach((zona) =>
    zoneInfo.set(zona.name.toLowerCase(), { site: zona.site, type: zona.type }),
  );

  const siteGroups = new Map<string, Map<string, SalesReportNode[]>>();

  rows.forEach((row) => {
    const node = nodoBase(row);
    const info = zoneInfo.get(node.zona.toLowerCase())
      ?? { site: SITE_DESCONOCIDO, type: TIPO_POR_DEFECTO };

    const techs = siteGroups.get(info.site) ?? new Map<string, SalesReportNode[]>();
    siteGroups.set(info.site, techs);
    const nodes = techs.get(info.type) ?? [];
    techs.set(info.type, nodes);
    nodes.push(node);
  });

  const siteOrder = config?.siteOrder ?? [];
  const orderIndex = (site: string): number => {
    const index = siteOrder.indexOf(site);
    return index === -1 ? siteOrder.length : index;
  };

  return [...siteGroups.keys()]
    .sort((a, b) => orderIndex(a) - orderIndex(b))
    .map((site) => ({
      site,
      technologies: [...(siteGroups.get(site)?.keys() ?? [])]
        .sort()
        .map((technology) => ({
          technology,
          nodes: [...(siteGroups.get(site)?.get(technology) ?? [])].sort(porActivosFinal),
        })),
    }));
}

/** Unidades de negocio: un grupo por coordinador, mas el bloque RF al final. */
export function buildBusinessUnitGroups(
  rows: DimensionVal[],
  config: ZonasConfig | undefined,
): BusinessUnitGroup[] {
  if (!rows.length) return [];

  const coordMap = new Map<string, string>();
  const rfZones = new Set<string>();

  config?.zonas.forEach((zona) => {
    const key = zona.name.toLowerCase();
    if (zona.coordinador) coordMap.set(key, zona.coordinador);
    if (zona.type.toUpperCase() === 'RF') rfZones.add(key);
  });

  const coordGroups = new Map<string, BusinessUnitNode[]>();
  const rfNodes: BusinessUnitNode[] = [];

  rows.forEach((row) => {
    const base = nodoBase(row);
    const key = base.zona.toLowerCase();
    const node: BusinessUnitNode = { ...base, type: rfZones.has(key) ? 'RF' : 'FTTH' };

    const coordinador = coordMap.get(key);
    if (coordinador) {
      const nodes = coordGroups.get(coordinador) ?? [];
      coordGroups.set(coordinador, nodes);
      nodes.push(node);
    }
    // Una zona RF entra ademas en el bloque consolidado, aunque tenga coordinador.
    if (rfZones.has(key)) rfNodes.push(node);
  });

  const groups: BusinessUnitGroup[] = [...coordGroups.keys()]
    .sort()
    .map((coordinador) => ({
      coordinador,
      nodes: [...(coordGroups.get(coordinador) ?? [])].sort(porActivosFinal),
      is_rf: false,
    }));

  if (rfNodes.length) {
    groups.push({
      coordinador: GRUPO_RF,
      nodes: [...rfNodes].sort(porActivosFinal),
      is_rf: true,
    });
  }

  return groups;
}
