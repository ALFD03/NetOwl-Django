/**
 * Agrega los nodos del Sales Report por tecnología y por site.
 *
 * Los totales se recalculan sobre los valores absolutos, no promediando
 * porcentajes.
 *
 * Aquí se resuelven también las metas: cada nodo con el suyo (desde su nivel
 * de nodo hacia arriba), y cada bloque de tecnología con el del **site**, que
 * ni el coordinador, ni la zona, ni el nodo mueven (ver `lib/targets.ts`).
 *
 * El filtro por métrica (`lib/metricFilter.ts`) se aplica a cada nodo o al
 * site entero, sobre los totales de los nodos que los otros filtros dejaron.
 */

import { useMemo } from 'react';

import type { Projection } from '@/shared/lib/projection';

import { aggregateNodes, type CommercialNode } from '../lib/commercial';
import {
  matchesFilter, filterThreshold, metricValues, type MetricFilter,
} from '../lib/metricFilter';
import { measuredNodes, type Goal, type TargetsResolver } from '../lib/targets';

export type SalesReportNode = CommercialNode;

export interface SalesReportTechnology {
  technology?: string;
  nodes?: SalesReportNode[];
  dynamic?: {
    active_start: number;
    active_end: number;
    new_subs: number;
    reactivations: number;
    churned: number;
    churn_rate: number;
    growth: number;
    /** Meta del bloque, resuelta desde el site. */
    goal: Goal;
  };
}

export interface SalesReportSite {
  site?: string;
  technologies?: SalesReportTechnology[];
  /** Meta del site entero (todas sus tecnologías en pantalla), resuelta desde el site. */
  goal?: Goal;
  /** Las cifras del site entero, solo de las zonas con objetivo: su resumen sencillo. */
  totals?: { active_start: number; active_end: number; new_subs: number };
}

interface UseSalesReportDataParams {
  sites: SalesReportSite[];
  searchTerm: string;
  selectedBranch: string;
  selectedTech: 'ALL' | 'FTTH' | 'RF';
  /** El periodo del reporte: decide qué tramo de objetivo está vigente. */
  period: string;
  targets: TargetsResolver;
  /** El filtro por crecimiento, churn o proyección, por nodo o por site. */
  metricFilter: MetricFilter;
  /** Los días laborables del corte elegido; sin ellos no se filtra por proyección. */
  projection?: Projection | null;
}

export function useSalesReportData({
  sites,
  searchTerm,
  selectedBranch,
  selectedTech,
  period,
  targets,
  metricFilter,
  projection: projection = null,
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

  const filteredData = useMemo(() => {
    const threshold = filterThreshold(metricFilter, projection);
    const filtersNodes = threshold !== null && metricFilter.level === 'zone';
    const filtersSites = threshold !== null && metricFilter.level === 'group';
    const meets = (figures: Parameters<typeof metricValues>[0], goal: Goal) =>
      matchesFilter(metricValues(figures, goal, { projection }), metricFilter, threshold);

    return sites.flatMap((site) => {
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
          goal: targets.goal(period, [node], 'zona_sucursal'),
          targetSource: targets.source(period, node, 'growth'),
        })).filter((node) => !filtersNodes || meets({ ...node, churn: node.gross_churn_pct }, node.goal));

        if (!nodes.length) return [];

        // La tabla lleva todos los nodos; el resumen, solo los que tienen objetivo.
        const totals = aggregateNodes(measuredNodes(targets, period, nodes));
        return [{
          ...tech,
          nodes,
          dynamic: {
            active_start: totals.active_start,
            active_end: totals.active_end,
            new_subs: totals.new_subs,
            churned: totals.churned,
            reactivations: totals.reactivations,
            churn_rate: totals.churn_rate,
            growth: totals.growth,
            goal: targets.goal(period, nodes, 'site'),
          },
        }];
      }) ?? [];

      if (!technologies.length) return [];
      // La del site entero, para enseñarla junto a su botón de exportar bajas:
      // sobre los mismos nodos que la tabla tiene en pantalla.
      const siteNodes = technologies.flatMap((tech) => tech.nodes ?? []);
      const goal = targets.goal(period, siteNodes, 'site');
      const totals = aggregateNodes(measuredNodes(targets, period, siteNodes));
      if (filtersSites && !meets({ ...totals, churn: totals.churn_rate }, goal)) return [];
      const siteTotals = { active_start: totals.active_start, active_end: totals.active_end, new_subs: totals.new_subs };
      return [{ ...site, technologies, goal, siteTotals }];
    });
  }, [sites, normalizedSearch, selectedBranch, selectedTech, period, targets, metricFilter, projection]);

  return { branchList, filteredData };
}
