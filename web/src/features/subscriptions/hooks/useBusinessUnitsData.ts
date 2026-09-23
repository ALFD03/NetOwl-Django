/**
 * Agrega los nodos por coordinador, más el bloque de radiofrecuencia.
 *
 * Ojo: aquí `tasaCumplimiento` **no se recorta a 100**, a diferencia del Sales
 * Report. Es una discrepancia intencionada (ver `lib/commercial.ts`).
 *
 * Las metas: cada nodo con el suyo (desde su nivel de nodo hacia arriba);
 * cada coordinador con el suyo, que la excepción de una zona o de un nodo no
 * mueve pero el de su site, su estado o su sucursal sí; el bloque RF y el
 * consolidado FTTH con el general del mes (ver `lib/objetivos.ts`).
 */

import { useMemo } from 'react';

import {
  aggregateNodes, calcComercial, type CommercialMetrics, type CommercialNode,
} from '../lib/commercial';
import type { Meta, ResolverObjetivos } from '../lib/objetivos';

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
    /** Meta del grupo: desde el coordinador, o la general si es el bloque RF. */
    meta: Meta;
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
  meta: Meta;
}

interface UseBusinessUnitsDataParams {
  groups: BusinessUnitGroup[];
  searchTerm: string;
  selectedBranch: string;
  selectedTech: 'ALL' | 'FTTH' | 'RF';
  /** El periodo del reporte: decide qué tramo de objetivo está vigente. */
  period: string;
  objetivos: ResolverObjetivos;
}

export function useBusinessUnitsData({
  groups,
  searchTerm,
  selectedBranch,
  selectedTech,
  period,
  objetivos,
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
    const filteredNodes = (group.nodes?.filter((node) => {
      const zoneMatches = String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
      const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
      const techMatches = selectedTech === 'ALL' || node.type === selectedTech;
      return (coordinatorMatches || zoneMatches) && branchMatches && techMatches;
    }) ?? []).map((node) => ({
      ...node,
      meta: objetivos.meta(period, [node], 'zona_sucursal'),
      origenObjetivo: objetivos.origen(period, node, 'crecimiento'),
    }));

    if (filteredNodes.length === 0) return [];

    return [{
      ...group,
      nodes: filteredNodes,
      dynamic: {
        ...aggregateNodes(filteredNodes),
        total_nodos: filteredNodes.length,
        // El bloque RF no es un coordinador: agrupa por tecnología a través de
        // sites y coordinadores, así que se mide contra el general.
        meta: objetivos.meta(period, filteredNodes, group.is_rf ? 'general' : 'coordinador'),
      },
    }];
  }), [groups, normalizedSearch, selectedBranch, selectedTech, period, objetivos]);

  const dynamicFtthSummary = useMemo<FtthSummary>(() => {
    const ftthNodes = groups.flatMap((group) => group.is_rf ? [] : group.nodes?.filter((node) => {
      const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
      const searchMatches = !normalizedSearch
        || String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
      return node.type === 'FTTH' && branchMatches && searchMatches;
    }) ?? []);

    const totals = aggregateNodes(ftthNodes);
    const meta = objetivos.meta(period, ftthNodes, 'general');

    return {
      ...totals,
      adiciones_brutas: totals.nuevos + totals.reactivaciones - totals.bajas,
      total_nodos: ftthNodes.length,
      meta,
      ...calcComercial(totals.activos_inicio, totals.activos_final, meta.metaCrecimiento, { nuevos: totals.nuevos }),
    };
  }, [groups, selectedBranch, normalizedSearch, period, objetivos]);

  return { branchList, filteredData, dynamicFtthSummary };
}
