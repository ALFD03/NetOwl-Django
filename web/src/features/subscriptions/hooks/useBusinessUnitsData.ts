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
 *
 * El filtro por métrica (`lib/filtroMetrica.ts`) se aplica a cada nodo o al
 * coordinador entero, sobre los totales de los nodos que los otros filtros
 * dejaron. El consolidado FTTH lo sigue: suma solo los nodos que lo cumplen, o
 * los de los coordinadores que lo cumplen.
 */

import { useMemo } from 'react';

import {
  aggregateNodes, calcComercial, type CommercialMetrics, type CommercialNode,
} from '../lib/commercial';
import type { Proyeccion } from '@/shared/lib/proyeccion';

import {
  cumpleFiltro, umbralFiltro, valoresMetrica, type FiltroMetrica,
} from '../lib/filtroMetrica';
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
  /** Los días laborables del corte elegido; el consolidado FTTH proyecta con ellos. */
  proyeccion?: Proyeccion | null;
  /** El filtro por crecimiento, churn o proyección, por nodo o por coordinador. */
  filtroMetrica: FiltroMetrica;
}

export function useBusinessUnitsData({
  groups,
  searchTerm,
  selectedBranch,
  selectedTech,
  period,
  objetivos,
  proyeccion = null,
  filtroMetrica,
}: UseBusinessUnitsDataParams) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const umbral = umbralFiltro(filtroMetrica, proyeccion);
  const filtraNodos = umbral !== null && filtroMetrica.nivel === 'zona';
  const filtraGrupos = umbral !== null && filtroMetrica.nivel === 'grupo';

  const branchList = useMemo(() => {
    const branches = new Set<string>();
    groups.forEach((group) => group.nodes?.forEach((node) => {
      if (node.sucursal) branches.add(node.sucursal);
    }));
    return Array.from(branches).sort();
  }, [groups]);

  const filteredData = useMemo(() => {
    // Unidades de Negocio no recorta los cumplimientos a 100 (ver `calcComercial`).
    const cumple = (cifras: Parameters<typeof valoresMetrica>[0], meta: Meta) =>
      cumpleFiltro(valoresMetrica(cifras, meta, { clamp: false, proyeccion }), filtroMetrica, umbral);

    return groups.flatMap((group) => {
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
      })).filter((node) => !filtraNodos || cumple({ ...node, churn: node.churn_bruto_pct }, node.meta));

      if (filteredNodes.length === 0) return [];

      const totals = aggregateNodes(filteredNodes);
      // El bloque RF no es un coordinador: agrupa por tecnología a través de
      // sites y coordinadores, así que se mide contra el general.
      const meta = objetivos.meta(period, filteredNodes, group.is_rf ? 'general' : 'coordinador');
      if (filtraGrupos && !cumple({ ...totals, churn: totals.churn_rate }, meta)) return [];

      return [{
        ...group,
        nodes: filteredNodes,
        dynamic: {
          ...totals,
          total_nodos: filteredNodes.length,
          meta,
        },
      }];
    });
  }, [groups, normalizedSearch, selectedBranch, selectedTech, period, objetivos, filtroMetrica, umbral, filtraNodos, filtraGrupos, proyeccion]);

  const dynamicFtthSummary = useMemo<FtthSummary>(() => {
    // Con el filtro por coordinador, solo cuentan los que lo cumplen.
    const coordinadores = filtraGrupos ? new Set(filteredData.map((group) => group.coordinador)) : null;
    const ftthNodes = groups.flatMap((group) => {
      if (group.is_rf || (coordinadores && !coordinadores.has(group.coordinador))) return [];
      return group.nodes?.filter((node) => {
        const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
        const searchMatches = !normalizedSearch
          || String(node.zona_sucursal ?? '').toLowerCase().includes(normalizedSearch);
        if (node.type !== 'FTTH' || !branchMatches || !searchMatches) return false;
        if (!filtraNodos) return true;
        const valores = valoresMetrica(
          { ...node, churn: node.churn_bruto_pct },
          objetivos.meta(period, [node], 'zona_sucursal'),
          { clamp: false, proyeccion },
        );
        return cumpleFiltro(valores, filtroMetrica, umbral);
      }) ?? [];
    });

    const totals = aggregateNodes(ftthNodes);
    const meta = objetivos.meta(period, ftthNodes, 'general');

    return {
      ...totals,
      adiciones_brutas: totals.nuevos + totals.reactivaciones - totals.bajas,
      total_nodos: ftthNodes.length,
      meta,
      ...calcComercial(totals.activos_inicio, totals.activos_final, meta.metaCrecimiento, {
        nuevos: totals.nuevos,
        proyeccion,
      }),
    };
  }, [groups, selectedBranch, normalizedSearch, period, objetivos, proyeccion, filteredData, filtroMetrica, umbral, filtraNodos, filtraGrupos]);

  return { branchList, filteredData, dynamicFtthSummary };
}
