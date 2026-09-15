/**
 * Agrega los nodos del Sales Report por tecnología y por site.
 *
 * Los totales se recalculan sobre los valores absolutos, no promediando
 * porcentajes.
 */

import { useMemo } from 'react';

import { aggregateNodes, type CommercialNode } from '../lib/commercial';

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

  };
}

export interface SalesReportSite {
  site?: string;
  technologies?: SalesReportTechnology[];
}

interface UseSalesReportDataParams {
  sites: SalesReportSite[];
  searchTerm: string;
  selectedBranch: string;
  selectedTech: 'ALL' | 'FTTH' | 'RF';
}

export function useSalesReportData({
  sites,
  searchTerm,
  selectedBranch,
  selectedTech,
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

      const nodes = tech.nodes?.filter((node) => {
        const nodeMatchesSearch = String(node.zona_sucursal || '').toLowerCase().includes(normalizedSearch);
        const branchMatches = selectedBranch === 'ALL' || node.sucursal === selectedBranch;
        return (siteMatchesSearch || nodeMatchesSearch) && branchMatches;
      }) ?? [];

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
        },
      }];
    }) ?? [];

    return technologies.length ? [{ ...site, technologies }] : [];
  }), [sites, normalizedSearch, selectedBranch, selectedTech]);

  return { branchList, filteredData };
}
