/**
 * Agrega los nodos por coordinador, más el bloque de radiofrecuencia.
 *
 * Ojo: aquí `tasaCumplimiento` **no se recorta a 100**, a diferencia del Sales
 * Report. Es una discrepancia intencionada (ver `lib/commercial.ts`).
 */

import { useMemo } from 'react';

import {
  aggregateNodes, calcComercial, type CommercialMetrics, type CommercialNode,
} from '../lib/commercial';

export interface BusinessUnitNode extends CommercialNode {
  type?: 'FTTH' | 'RF' | string;
}

export interface BusinessUnitGroup {
  coordinador: string;
  nodes?: BusinessUnitNode[];
  is_rf?: boolean;
  dynamic?: {
    activos_inicio: number;
    activos_final: number;
    nuevos: number;
    reactivaciones: number;
    bajas: number;
    crecimiento: number;
    churn_rate: number;
    total_nodos: number;
  };
}

export interface FtthSummary extends CommercialMetrics {
  activos_inicio: number;
  activos_final: number;
  nuevos: number;
  reactivaciones: number;
  bajas: number;
  crecimiento: number;
  churn_rate: number;
  adiciones_brutas: number;
  total_nodos: number;
}

interface UseBusinessUnitsDataParams {
  groups: BusinessUnitGroup[];
  searchTerm: string;
  selectedBranch: string;
  selectedTech: 'ALL' | 'FTTH' | 'RF';
}

export function useBusinessUnitsData({
  groups,
  searchTerm,
  selectedBranch,
  selectedTech,
}: UseBusinessUnitsDataParams) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const branchList = useMemo(() => {
    const branches = new Set<string>();
    groups.forEach((group) => group.nodes?.forEach((node) => {
      if (node.sucursal) branches.add(node.sucursal);
    }));
    return Array.from(branches).sort();
  }, [groups]);

  const filteredData = useMemo(() => groups.flatMap((group) => {
    if (group.is_rf && selectedTech === 'FTTH') return [];

    const coordinatorMatches = group.coordinador.toLowerCase().includes(normalizedSearch);
    const filteredNodes = group.nodes?.filter((node) => {
      const zoneMatches = String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
      const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
      const techMatches = selectedTech === 'ALL' || node.type === selectedTech;
      return (coordinatorMatches || zoneMatches) && branchMatches && techMatches;
    }) ?? [];

    if (filteredNodes.length === 0) return [];

    return [{
      ...group,
      nodes: filteredNodes,
      dynamic: { ...aggregateNodes(filteredNodes), total_nodos: filteredNodes.length },
    }];
  }), [groups, normalizedSearch, selectedBranch, selectedTech]);

  const dynamicFtthSummary = useMemo<FtthSummary>(() => {
    const ftthNodes = groups.flatMap((group) => group.is_rf ? [] : group.nodes?.filter((node) => {
      const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
      const searchMatches = !normalizedSearch
        || String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
      return node.type === 'FTTH' && branchMatches && searchMatches;
    }) ?? []);

    const totals = aggregateNodes(ftthNodes);

    return {
      ...totals,
      adiciones_brutas: totals.nuevos + totals.reactivaciones - totals.bajas,
      total_nodos: ftthNodes.length,
      ...calcComercial(totals.activos_inicio, totals.activos_final),
    };
  }, [groups, selectedBranch, normalizedSearch]);

  return { branchList, filteredData, dynamicFtthSummary };
}
