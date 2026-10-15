/**
 * Agrega los nodos del Sales Report por tecnología y por site.
 *
 * Los totales se recalculan sobre los valores absolutos, no promediando
 * porcentajes.
 *
 * Aquí se resuelven también las metas: cada nodo con el suyo (desde su nivel
 * de nodo hacia arriba), y cada bloque de tecnología con el del **site**, que
 * ni el coordinador, ni la zona, ni el nodo mueven (ver `lib/objetivos.ts`).
 *
 * El filtro por métrica (`lib/filtroMetrica.ts`) se aplica a cada nodo o al
 * site entero, sobre los totales de los nodos que los otros filtros dejaron.
 */

import { useMemo } from 'react';

import type { Proyeccion } from '@/shared/lib/proyeccion';

import { aggregateNodes, type CommercialNode } from '../lib/commercial';
import {
  cumpleFiltro, umbralFiltro, valoresMetrica, type FiltroMetrica,
} from '../lib/filtroMetrica';
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
  /** El filtro por crecimiento, churn o proyección, por nodo o por site. */
  filtroMetrica: FiltroMetrica;
  /** Los días laborables del corte elegido; sin ellos no se filtra por proyección. */
  proyeccion?: Proyeccion | null;
}

export function useSalesReportData({
  sites,
  searchTerm,
  selectedBranch,
  selectedTech,
  period,
  objetivos,
  filtroMetrica,
  proyeccion = null,
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
    const umbral = umbralFiltro(filtroMetrica, proyeccion);
    const filtraNodos = umbral !== null && filtroMetrica.nivel === 'zona';
    const filtraSites = umbral !== null && filtroMetrica.nivel === 'grupo';
    // Ventas recorta los cumplimientos a 100; el filtro compara contra lo que se ve.
    const cumple = (cifras: Parameters<typeof valoresMetrica>[0], meta: Meta) =>
      cumpleFiltro(valoresMetrica(cifras, meta, { clamp: true, proyeccion }), filtroMetrica, umbral);

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
          meta: objetivos.meta(period, [node], 'zona_sucursal'),
          origenObjetivo: objetivos.origen(period, node, 'crecimiento'),
        })).filter((node) => !filtraNodos || cumple({ ...node, churn: node.churn_bruto_pct }, node.meta));

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
      const meta = objetivos.meta(period, nodosSite, 'site');
      if (filtraSites) {
        const totals = aggregateNodes(nodosSite);
        if (!cumple({ ...totals, churn: totals.churn_rate }, meta)) return [];
      }
      return [{ ...site, technologies, meta }];
    });
  }, [sites, normalizedSearch, selectedBranch, selectedTech, period, objetivos, filtroMetrica, proyeccion]);

  return { branchList, filteredData };
}
