/**
 * Agrega los nodos del Sales Report por tecnología y por site.
 *
 * Los totales se recalculan sobre los valores absolutos, no promediando
 * porcentajes.
 *
 * Aquí se resuelven también las metas: cada nodo con el suyo (desde su nivel
 * de nodo hacia arriba), y cada bloque de tecnología con el del **site**, que
 * ni el coordinador, ni la zona, ni el nodo mueven (ver `lib/objetivos.ts`).
 */

import { useMemo } from 'react';

import { aggregateNodes, type CommercialNode } from '../lib/commercial';
import type { Meta, ResolverObjetivos } from '../lib/objetivos';

export type SalesReportNode = CommercialNode;

export interface SalesReportTechnology {
  technology?: string;
  nodes?: SalesReportNode[];
  dynamic?: {
    activos_inicio: number;
    activos_final: number;
    nuevos: number;
    reactivaciones: number;
    bajas: number;
    churn_rate: number;
    crecimiento: number;
    /** Meta del bloque, resuelta desde el site. */
    meta: Meta;
  };
}

export interface SalesReportSite {
  site?: string;
  technologies?: SalesReportTechnology[];
  /** Meta del site entero (todas sus tecnologías en pantalla), resuelta desde el site. */
  meta?: Meta;
}

interface UseSalesReportDataParams {
  sites: SalesReportSite[];
  searchTerm: string;
  selectedBranch: string;
  selectedTech: 'ALL' | 'FTTH' | 'RF';
  /** El periodo del reporte: decide qué tramo de objetivo está vigente. */
  period: string;
  objetivos: ResolverObjetivos;
}

export function useSalesReportData({
  sites,
  searchTerm,
  selectedBranch,
  selectedTech,
  period,
  objetivos,
}: UseSalesReportDataParams) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const branchList = useMemo(() => {
    const branches = new Set<string>();
    sites.forEach((site) =>
      site.technologies?.forEach((tech) =>
        tech.nodes?.forEach((node) => {
          if (node.sucursal) branches.add(node.sucursal);
        }),
      ),
    );
    return Array.from(branches).sort();
  }, [sites]);

  const filteredData = useMemo(() => sites.flatMap((site) => {
    const siteMatchesSearch = String(site.site || '').toLowerCase().includes(normalizedSearch);

    const technologies = site.technologies?.flatMap((tech) => {
      const normalizedTechnology = String(tech.technology || '').toUpperCase();
      if (selectedTech === 'FTTH' && normalizedTechnology !== 'FTTH') return [];
      if (selectedTech === 'RF' && normalizedTechnology !== 'RF') return [];

      const nodes = (tech.nodes?.filter((node) => {
        const nodeMatchesSearch = String(node.zona_sucursal || '').toLowerCase().includes(normalizedSearch);
        const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
        return (siteMatchesSearch || nodeMatchesSearch) && branchMatches;
      }) ?? []).map((node) => ({
        ...node,
        meta: objetivos.meta(period, [node], 'zona_sucursal'),
        origenObjetivo: objetivos.origen(period, node, 'crecimiento'),
      }));

      if (!nodes.length) return [];

      const totals = aggregateNodes(nodes);
      return [{
        ...tech,
        nodes,
        dynamic: {
          activos_inicio: totals.activos_inicio,
          activos_final: totals.activos_final,
          nuevos: totals.nuevos,
          bajas: totals.bajas,
          reactivaciones: totals.reactivaciones,
          churn_rate: totals.churn_rate,
          crecimiento: totals.crecimiento,
          meta: objetivos.meta(period, nodes, 'site'),
        },
      }];
    }) ?? [];

    if (!technologies.length) return [];
    // La del site entero, para enseñarla junto a su botón de exportar bajas:
    // sobre los mismos nodos que la tabla tiene en pantalla.
    const nodosSite = technologies.flatMap((tech) => tech.nodes ?? []);
    return [{ ...site, technologies, meta: objetivos.meta(period, nodosSite, 'site') }];
  }), [sites, normalizedSearch, selectedBranch, selectedTech, period, objetivos]);

  return { branchList, filteredData };
}
