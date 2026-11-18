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

import type { Proyeccion } from '@/shared/lib/projection';

import { aggregateNodes, type CommercialNode } from '../lib/commercial';
import {
  matchesFilter, filterThreshold, metricValues, type MetricFilter,
} from '../lib/metricFilter';
import { measuredNodes, type Meta, type TargetsResolver } from '../lib/targets';

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
    meta: Meta;
  };
}

export interface SalesReportSite {
  site?: string;
  technologies?: SalesReportTechnology[];
  /** Meta del site entero (todas sus tecnologías en pantalla), resuelta desde el site. */
  meta?: Meta;
  /** Las cifras del site entero, solo de las zonas con objetivo: su resumen sencillo. */
  totales?: { active_start: number; active_end: number; new_subs: number };
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
  projection?: Proyeccion | null;
}

export function useSalesReportData({
  sites,
  searchTerm,
  selectedBranch,
  selectedTech,
  period,
  targets,
  metricFilter: filtroMetrica,
  projection: proyeccion = null,
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
    const umbral = filterThreshold(filtroMetrica, proyeccion);
    const filtersNodes = umbral !== null && filtroMetrica.level === 'zona';
    const filtraSites = umbral !== null && filtroMetrica.level === 'grupo';
    const cumple = (cifras: Parameters<typeof metricValues>[0], meta: Meta) =>
      matchesFilter(metricValues(cifras, meta, { projection: proyeccion }), filtroMetrica, umbral);

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
          meta: targets.meta(period, [node], 'zona_sucursal'),
          targetSource: targets.origen(period, node, 'growth'),
        })).filter((node) => !filtersNodes || cumple({ ...node, churn: node.gross_churn_pct }, node.meta));

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
            meta: targets.meta(period, nodes, 'site'),
          },
        }];
      }) ?? [];

      if (!technologies.length) return [];
      // La del site entero, para enseñarla junto a su botón de exportar bajas:
      // sobre los mismos nodos que la tabla tiene en pantalla.
      const siteNodes = technologies.flatMap((tech) => tech.nodes ?? []);
      const meta = targets.meta(period, siteNodes, 'site');
      const totals = aggregateNodes(measuredNodes(targets, period, siteNodes));
      if (filtraSites && !cumple({ ...totals, churn: totals.churn_rate }, meta)) return [];
      const totales = { active_start: totals.active_start, active_end: totals.active_end, new_subs: totals.new_subs };
      return [{ ...site, technologies, meta, totales }];
    });
  }, [sites, normalizedSearch, selectedBranch, selectedTech, period, targets, filtroMetrica, proyeccion]);

  return { branchList, filteredData };
}
