/**
 * Agrega los nodos por coordinador, más el bloque de radiofrecuencia.
 *
 * Ojo: aquí `complianceRate` **no se recorta a 100**, a diferencia del Sales
 * Report. Es una discrepancia intencionada (ver `lib/commercial.ts`).
 *
 * Las metas: cada nodo con el suyo (desde su nivel de nodo hacia arriba);
 * cada coordinador con el suyo, que la excepción de una zona o de un nodo no
 * mueve pero el de su site, su estado o su sucursal sí; el bloque RF y el
 * consolidado FTTH con el general del mes (ver `lib/targets.ts`).
 *
 * El filtro por métrica (`lib/metricFilter.ts`) se aplica a cada nodo o al
 * coordinador entero, sobre los totales de los nodos que los otros filtros
 * dejaron. El consolidado FTTH lo sigue: suma solo los nodos que lo cumplen, o
 * los de los coordinadores que lo cumplen.
 *
 * Quien no ve todas las unidades no recibe los nodos de las demás, así que su
 * consolidado FTTH llega ya sumado (`ftthFijo`, de `restringir_unidades`) y
 * no sigue los filtros: es siempre el de toda la empresa en ese corte.
 */

import { useMemo } from 'react';

import {
  aggregateNodes, calcCommercial, type CommercialMetrics, type CommercialNode,
} from '../lib/commercial';
import type { Proyeccion } from '@/shared/lib/projection';

import {
  matchesFilter, filterThreshold, metricValues, type MetricFilter,
} from '../lib/metricFilter';
import { measuredNodes, type Meta, type TargetsResolver } from '../lib/targets';

export interface BusinessUnitNode extends CommercialNode {
  type?: 'FTTH' | 'RF' | string;
}

export interface BusinessUnitGroup {
  coordinator: string;
  nodes?: BusinessUnitNode[];
  is_rf?: boolean;
  dynamic?: {
    active_start: number;
    active_end: number;
    new_subs: number;
    reactivations: number;
    churned: number;
    growth: number;
    churn_rate: number;
    total_nodes: number;
    /** Meta del grupo: desde el coordinador, o la general si es el bloque RF. */
    meta: Meta;
  };
}

export interface FtthSummary extends CommercialMetrics {
  active_start: number;
  active_end: number;
  new_subs: number;
  reactivations: number;
  churned: number;
  growth: number;
  churn_rate: number;
  gross_adds: number;
  total_nodes: number;
  meta: Meta;
}

interface UseBusinessUnitsDataParams {
  groups: BusinessUnitGroup[];
  searchTerm: string;
  selectedBranch: string;
  selectedTech: 'ALL' | 'FTTH' | 'RF';
  /** El periodo del reporte: decide qué tramo de objetivo está vigente. */
  period: string;
  targets: TargetsResolver;
  /** Los días laborables del corte elegido; el consolidado FTTH proyecta con ellos. */
  projection?: Proyeccion | null;
  /** El filtro por crecimiento, churn o proyección, por nodo o por coordinador. */
  metricFilter: MetricFilter;
  /** El consolidado FTTH ya sumado, para quien no ve todas las unidades. */
  ftthFijo?: FtthNodeTotals | null;
}

/** Un nodo con la suma de los nodos FTTH de toda la empresa en un corte. */
export interface FtthNodeTotals {
  active_start: number;
  active_end: number;
  new_subs: number;
  reactivations: number;
  churned: number;
  total_nodes: number;
}

export function useBusinessUnitsData({
  groups,
  searchTerm,
  selectedBranch,
  selectedTech,
  period,
  targets,
  projection: proyeccion = null,
  metricFilter: filtroMetrica,
  ftthFijo = null,
}: UseBusinessUnitsDataParams) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const umbral = filterThreshold(filtroMetrica, proyeccion);
  const filtersNodes = umbral !== null && filtroMetrica.level === 'zona';
  const filtersGroups = umbral !== null && filtroMetrica.level === 'grupo';

  const branchList = useMemo(() => {
    const branches = new Set<string>();
    groups.forEach((group) => group.nodes?.forEach((node) => {
      if (node.sucursal) branches.add(node.sucursal);
    }));
    return Array.from(branches).sort();
  }, [groups]);

  const filteredData = useMemo(() => {
    const cumple = (cifras: Parameters<typeof metricValues>[0], meta: Meta) =>
      matchesFilter(metricValues(cifras, meta, { projection: proyeccion }), filtroMetrica, umbral);

    return groups.flatMap((group) => {
      if (group.is_rf && selectedTech === 'FTTH') return [];

      const coordinatorMatches = group.coordinator.toLowerCase().includes(normalizedSearch);
      const filteredNodes = (group.nodes?.filter((node) => {
        const zoneMatches = String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
        const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
        const techMatches = selectedTech === 'ALL' || node.type === selectedTech;
        return (coordinatorMatches || zoneMatches) && branchMatches && techMatches;
      }) ?? []).map((node) => ({
        ...node,
        meta: targets.meta(period, [node], 'zona_sucursal'),
        targetSource: targets.origen(period, node, 'growth'),
      })).filter((node) => !filtersNodes || cumple({ ...node, churn: node.gross_churn_pct }, node.meta));

      if (filteredNodes.length === 0) return [];

      // La tabla lleva todos los nodos; el resumen, solo los que tienen objetivo.
      const totals = aggregateNodes(measuredNodes(targets, period, filteredNodes));
      // El bloque RF no es un coordinador: agrupa por tecnología a través de
      // sites y coordinadores, así que se mide contra el general.
      const meta = targets.meta(period, filteredNodes, group.is_rf ? 'general' : 'coordinador');
      if (filtersGroups && !cumple({ ...totals, churn: totals.churn_rate }, meta)) return [];

      return [{
        ...group,
        nodes: filteredNodes,
        dynamic: {
          ...totals,
          total_nodes: filteredNodes.length,
          meta,
        },
      }];
    });
  }, [groups, normalizedSearch, selectedBranch, selectedTech, period, targets, filtroMetrica, umbral, filtersNodes, filtersGroups, proyeccion]);

  const dynamicFtthSummary = useMemo<FtthSummary>(() => {
    // Con el filtro por coordinador, solo cuentan los que lo cumplen.
    const coordinadores = filtersGroups ? new Set(filteredData.map((group) => group.coordinator)) : null;
    const ftthNodes = ftthFijo ? [ftthFijo] : groups.flatMap((group) => {
      if (group.is_rf || (coordinadores && !coordinadores.has(group.coordinator))) return [];
      return group.nodes?.filter((node) => {
        const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
        const searchMatches = !normalizedSearch
          || String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
        if (node.type !== 'FTTH' || !branchMatches || !searchMatches) return false;
        if (!filtersNodes) return true;
        const valores = metricValues(
          { ...node, churn: node.gross_churn_pct },
          targets.meta(period, [node], 'zona_sucursal'),
          { projection: proyeccion },
        );
        return matchesFilter(valores, filtroMetrica, umbral);
      }) ?? [];
    });

    // El consolidado tampoco suma las zonas sin objetivo. El ya sumado que
    // recibe una cuenta restringida (`ftthFijo`) no se puede descomponer.
    const totals = aggregateNodes(measuredNodes(targets, period, ftthNodes));
    const meta = targets.meta(period, ftthNodes, 'general');

    return {
      ...totals,
      gross_adds: totals.new_subs + totals.reactivations - totals.churned,
      total_nodes: ftthFijo ? ftthFijo.total_nodes : ftthNodes.length,
      meta,
      ...calcCommercial(totals.active_start, totals.active_end, meta, {
        new_subs: totals.new_subs,
        projection: proyeccion,
      }),
    };
  }, [groups, selectedBranch, normalizedSearch, period, targets, proyeccion, filteredData, filtroMetrica, umbral, filtersNodes, filtersGroups, ftthFijo]);

  return { branchList, filteredData, dynamicFtthSummary };
}
