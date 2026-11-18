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
import type { Projection } from '@/shared/lib/projection';

import {
  matchesFilter, filterThreshold, metricValues, type MetricFilter,
} from '../lib/metricFilter';
import { measuredNodes, type Goal, type TargetsResolver } from '../lib/targets';

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
    goal: Goal;
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
  goal: Goal;
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
  projection?: Projection | null;
  /** El filtro por crecimiento, churn o proyección, por nodo o por coordinador. */
  metricFilter: MetricFilter;
  /** El consolidado FTTH ya sumado, para quien no ve todas las unidades. */
  ftthFixed?: FtthNodeTotals | null;
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
  projection: projection = null,
  metricFilter,
  ftthFixed: ftthFixed = null,
}: UseBusinessUnitsDataParams) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const threshold = filterThreshold(metricFilter, projection);
  const filtersNodes = threshold !== null && metricFilter.level === 'zone';
  const filtersGroups = threshold !== null && metricFilter.level === 'group';

  const branchList = useMemo(() => {
    const branches = new Set<string>();
    groups.forEach((group) => group.nodes?.forEach((node) => {
      if (node.sucursal) branches.add(node.sucursal);
    }));
    return Array.from(branches).sort();
  }, [groups]);

  const filteredData = useMemo(() => {
    const meets = (figures: Parameters<typeof metricValues>[0], goal: Goal) =>
      matchesFilter(metricValues(figures, goal, { projection }), metricFilter, threshold);

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
        goal: targets.goal(period, [node], 'zona_sucursal'),
        targetSource: targets.source(period, node, 'growth'),
      })).filter((node) => !filtersNodes || meets({ ...node, churn: node.gross_churn_pct }, node.goal));

      if (filteredNodes.length === 0) return [];

      // La tabla lleva todos los nodos; el resumen, solo los que tienen objetivo.
      const totals = aggregateNodes(measuredNodes(targets, period, filteredNodes));
      // El bloque RF no es un coordinador: agrupa por tecnología a través de
      // sites y coordinadores, así que se mide contra el general.
      const goal = targets.goal(period, filteredNodes, group.is_rf ? 'general' : 'coordinador');
      if (filtersGroups && !meets({ ...totals, churn: totals.churn_rate }, goal)) return [];

      return [{
        ...group,
        nodes: filteredNodes,
        dynamic: {
          ...totals,
          total_nodes: filteredNodes.length,
          goal,
        },
      }];
    });
  }, [groups, normalizedSearch, selectedBranch, selectedTech, period, targets, metricFilter, threshold, filtersNodes, filtersGroups, projection]);

  const dynamicFtthSummary = useMemo<FtthSummary>(() => {
    // Con el filtro por coordinador, solo cuentan los que lo cumplen.
    const coordinators = filtersGroups ? new Set(filteredData.map((group) => group.coordinator)) : null;
    const ftthNodes = ftthFixed ? [ftthFixed] : groups.flatMap((group) => {
      if (group.is_rf || (coordinators && !coordinators.has(group.coordinator))) return [];
      return group.nodes?.filter((node) => {
        const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
        const searchMatches = !normalizedSearch
          || String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
        if (node.type !== 'FTTH' || !branchMatches || !searchMatches) return false;
        if (!filtersNodes) return true;
        const values = metricValues(
          { ...node, churn: node.gross_churn_pct },
          targets.goal(period, [node], 'zona_sucursal'),
          { projection },
        );
        return matchesFilter(values, metricFilter, threshold);
      }) ?? [];
    });

    // El consolidado tampoco suma las zonas sin objetivo. El ya sumado que
    // recibe una cuenta restringida (`ftthFijo`) no se puede descomponer.
    const totals = aggregateNodes(measuredNodes(targets, period, ftthNodes));
    const goal = targets.goal(period, ftthNodes, 'general');

    return {
      ...totals,
      gross_adds: totals.new_subs + totals.reactivations - totals.churned,
      total_nodes: ftthFixed ? ftthFixed.total_nodes : ftthNodes.length,
      goal,
      ...calcCommercial(totals.active_start, totals.active_end, goal, {
        new_subs: totals.new_subs,
        projection,
      }),
    };
  }, [groups, selectedBranch, normalizedSearch, period, targets, projection, filteredData, metricFilter, threshold, filtersNodes, filtersGroups, ftthFixed]);

  return { branchList, filteredData, dynamicFtthSummary };
}
